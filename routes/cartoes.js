// Cartões de crédito e pagamentos de fatura.
//
// Regra para não cobrar duas vezes:
//  - A compra no crédito é um lançamento (forma 'credito' + cartaoId). Ela conta
//    como gasto, mas NÃO mexe no saldo da conta.
//  - O pagamento da fatura fica em fatura_pagamentos (não é lançamento). Ele não
//    conta como gasto, mas tira o dinheiro da conta na data do pagamento.
// As faturas (qual compra cai em qual mês, status, total) são calculadas no
// navegador a partir dos dias de fechamento e vencimento do cartão.

const express = require('express')
const router = express.Router()

const pool = require('../db/connections')
const exigirLogin = require('../middleware/auth')
const { garantirEsquemaCartoes } = require('../lib/esquemaCartoes')

router.use(exigirLogin, async (req, res, next) => {
  try {
    await garantirEsquemaCartoes()
    next()
  } catch (erro) {
    console.log('Erro ao preparar tabelas de cartões:', erro)
    res.status(500).json({ erro: 'Erro ao preparar cartões.' })
  }
})

function idValido(valor) {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : null
}

function diaValido(valor) {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero >= 1 && numero <= 31 ? numero : null
}

function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const [ano, mes, dia] = data.split('-').map(Number)
  const objeto = new Date(Date.UTC(ano, mes - 1, dia))
  return objeto.getUTCFullYear() === ano && objeto.getUTCMonth() === mes - 1 && objeto.getUTCDate() === dia
}

async function bancoDoUsuario(usuarioId, bancoId) {
  const [linhas] = await pool.query('SELECT id FROM bancos WHERE id = ? AND usuarioId = ?', [bancoId, usuarioId])
  return linhas.length > 0
}

function normalizarCartao(cartao) {
  return {
    ...cartao,
    limite: cartao.limite === null ? null : Number(cartao.limite),
    reservar_fatura: Boolean(cartao.reservar_fatura),
  }
}

function lerCartao(corpo, parcial = false) {
  const dados = {}
  const erros = []

  if (!parcial || corpo.nome !== undefined) {
    if (typeof corpo.nome !== 'string' || !corpo.nome.trim() || corpo.nome.trim().length > 80) {
      erros.push('Nome do cartão inválido.')
    } else {
      dados.nome = corpo.nome.trim()
    }
  }

  if (!parcial || corpo.bancoId !== undefined) {
    const bancoId = idValido(corpo.bancoId)
    if (!bancoId) erros.push('Escolha a conta que paga a fatura.')
    else dados.bancoId = bancoId
  }

  if (!parcial || corpo.dia_fechamento !== undefined) {
    const dia = diaValido(corpo.dia_fechamento)
    if (!dia) erros.push('Dia de fechamento inválido (1 a 31).')
    else dados.dia_fechamento = dia
  }

  if (!parcial || corpo.dia_vencimento !== undefined) {
    const dia = diaValido(corpo.dia_vencimento)
    if (!dia) erros.push('Dia de vencimento inválido (1 a 31).')
    else dados.dia_vencimento = dia
  }

  if (corpo.limite !== undefined) {
    if (corpo.limite === null || corpo.limite === '') {
      dados.limite = null
    } else {
      const limite = Number(corpo.limite)
      if (!Number.isFinite(limite) || limite <= 0 || limite > 99999999) erros.push('Limite inválido.')
      else dados.limite = Math.round(limite * 100) / 100
    }
  }

  if (corpo.reservar_fatura !== undefined) {
    if (typeof corpo.reservar_fatura !== 'boolean') erros.push('Opção de reserva inválida.')
    else dados.reservar_fatura = corpo.reservar_fatura
  }

  return { dados, erros }
}

router.get('/', async (req, res) => {
  try {
    const [cartoes] = await pool.query(
      `SELECT id, bancoId, nome, dia_fechamento, dia_vencimento, limite, reservar_fatura
       FROM cartoes WHERE usuarioId = ? ORDER BY id`,
      [req.usuarioId],
    )
    const [pagamentos] = await pool.query(
      `SELECT id, cartaoId, fatura_mes, valor, DATE_FORMAT(data, '%Y-%m-%d') AS data, bancoId
       FROM fatura_pagamentos WHERE usuarioId = ? ORDER BY data, id`,
      [req.usuarioId],
    )
    res.json({
      cartoes: cartoes.map(normalizarCartao),
      pagamentos: pagamentos.map((item) => ({ ...item, valor: Number(item.valor) })),
    })
  } catch (erro) {
    console.log('Erro ao buscar cartões:', erro)
    res.status(500).json({ erro: 'Erro ao buscar cartões.' })
  }
})

router.post('/', async (req, res) => {
  const { dados, erros } = lerCartao(req.body)
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') })

  try {
    if (!(await bancoDoUsuario(req.usuarioId, dados.bancoId))) {
      return res.status(400).json({ erro: 'Conta não encontrada.' })
    }

    const [resultado] = await pool.query(
      `INSERT INTO cartoes (usuarioId, bancoId, nome, dia_fechamento, dia_vencimento, limite, reservar_fatura)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.usuarioId,
        dados.bancoId,
        dados.nome,
        dados.dia_fechamento,
        dados.dia_vencimento,
        dados.limite ?? null,
        dados.reservar_fatura ?? false,
      ],
    )

    const [linhas] = await pool.query('SELECT * FROM cartoes WHERE id = ?', [resultado.insertId])
    res.status(201).json({ mensagem: 'Cartão criado', cartao: normalizarCartao(linhas[0]) })
  } catch (erro) {
    console.log('Erro ao criar cartão:', erro)
    res.status(500).json({ erro: 'Erro ao criar cartão.' })
  }
})

router.patch('/:id', async (req, res) => {
  const id = idValido(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  const { dados, erros } = lerCartao(req.body, true)
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') })
  if (Object.keys(dados).length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' })

  try {
    if (dados.bancoId && !(await bancoDoUsuario(req.usuarioId, dados.bancoId))) {
      return res.status(400).json({ erro: 'Conta não encontrada.' })
    }

    const campos = Object.keys(dados)
    const [resultado] = await pool.query(
      `UPDATE cartoes SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE id = ? AND usuarioId = ?`,
      [...campos.map((campo) => dados[campo]), id, req.usuarioId],
    )
    if (resultado.affectedRows === 0) return res.status(404).json({ erro: 'Cartão não encontrado.' })

    // Compras no cartão ficam "na conta" que paga a fatura.
    if (dados.bancoId) {
      await pool.query('UPDATE lancamentos SET bancoId = ? WHERE cartaoId = ? AND usuarioId = ?', [
        String(dados.bancoId),
        id,
        req.usuarioId,
      ])
    }

    const [linhas] = await pool.query('SELECT * FROM cartoes WHERE id = ?', [id])
    res.json({ mensagem: 'Cartão atualizado', cartao: normalizarCartao(linhas[0]) })
  } catch (erro) {
    console.log('Erro ao atualizar cartão:', erro)
    res.status(500).json({ erro: 'Erro ao atualizar cartão.' })
  }
})

router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  const conexao = await pool.getConnection()
  try {
    await conexao.beginTransaction()
    const [resultado] = await conexao.query('DELETE FROM cartoes WHERE id = ? AND usuarioId = ?', [id, req.usuarioId])
    if (resultado.affectedRows === 0) {
      await conexao.rollback()
      return res.status(404).json({ erro: 'Cartão não encontrado.' })
    }

    // Sem o cartão, as compras no crédito não teriam fatura: são removidas junto.
    // Gastos no débito continuam na conta, só perdem o vínculo com o cartão.
    const [compras] = await conexao.query(
      `DELETE FROM lancamentos WHERE cartaoId = ? AND usuarioId = ? AND forma = 'credito'`,
      [id, req.usuarioId],
    )
    await conexao.query('UPDATE lancamentos SET cartaoId = NULL WHERE cartaoId = ? AND usuarioId = ?', [
      id,
      req.usuarioId,
    ])
    await conexao.commit()
    res.json({ mensagem: 'Cartão excluído', id, comprasRemovidas: compras.affectedRows })
  } catch (erro) {
    await conexao.rollback()
    console.log('Erro ao excluir cartão:', erro)
    res.status(500).json({ erro: 'Erro ao excluir cartão.' })
  } finally {
    conexao.release()
  }
})

router.post('/:id/pagamentos', async (req, res) => {
  const cartaoId = idValido(req.params.id)
  const bancoId = idValido(req.body.bancoId)
  const valor = Math.round(Number(req.body.valor) * 100) / 100
  const { data, fatura_mes: faturaMes } = req.body

  if (!cartaoId) return res.status(400).json({ erro: 'ID inválido.' })
  if (!bancoId) return res.status(400).json({ erro: 'Escolha a conta que pagou.' })
  if (!Number.isFinite(valor) || valor <= 0 || valor > 99999999) return res.status(400).json({ erro: 'Valor inválido.' })
  if (!dataValida(data)) return res.status(400).json({ erro: 'Data inválida.' })
  if (typeof faturaMes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(faturaMes)) {
    return res.status(400).json({ erro: 'Fatura inválida.' })
  }

  try {
    const [cartoes] = await pool.query('SELECT id FROM cartoes WHERE id = ? AND usuarioId = ?', [cartaoId, req.usuarioId])
    if (cartoes.length === 0) return res.status(404).json({ erro: 'Cartão não encontrado.' })
    if (!(await bancoDoUsuario(req.usuarioId, bancoId))) return res.status(400).json({ erro: 'Conta não encontrada.' })

    const [resultado] = await pool.query(
      `INSERT INTO fatura_pagamentos (usuarioId, cartaoId, fatura_mes, valor, data, bancoId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.usuarioId, cartaoId, faturaMes, valor, data, bancoId],
    )
    res.status(201).json({
      mensagem: 'Pagamento registrado',
      pagamento: { id: resultado.insertId, cartaoId, fatura_mes: faturaMes, valor, data, bancoId },
    })
  } catch (erro) {
    console.log('Erro ao registrar pagamento de fatura:', erro)
    res.status(500).json({ erro: 'Erro ao registrar pagamento.' })
  }
})

router.delete('/:id/pagamentos/:pagamentoId', async (req, res) => {
  const cartaoId = idValido(req.params.id)
  const pagamentoId = idValido(req.params.pagamentoId)
  if (!cartaoId || !pagamentoId) return res.status(400).json({ erro: 'ID inválido.' })

  try {
    const [resultado] = await pool.query(
      'DELETE FROM fatura_pagamentos WHERE id = ? AND cartaoId = ? AND usuarioId = ?',
      [pagamentoId, cartaoId, req.usuarioId],
    )
    if (resultado.affectedRows === 0) return res.status(404).json({ erro: 'Pagamento não encontrado.' })
    res.json({ mensagem: 'Pagamento excluído', id: pagamentoId })
  } catch (erro) {
    console.log('Erro ao excluir pagamento de fatura:', erro)
    res.status(500).json({ erro: 'Erro ao excluir pagamento.' })
  }
})

module.exports = router
