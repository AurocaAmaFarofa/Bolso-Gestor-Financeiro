const express = require('express')
const router = express.Router()

const pool = require('../db/connections')
const exigirLogin = require('../middleware/auth')

function mesValido(mes) {
  return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

function numeroDoMes(mes) {
  const [ano, numeroMes] = mes.split('-').map(Number)
  return ano * 12 + numeroMes - 1
}

function reservaVigenteNoMes(reserva, mes) {
  if (reserva.mes_criado === null || reserva.mes_criado === undefined) {
    return true
  }

  if (!mesValido(reserva.mes_criado)) {
    return false
  }

  const mesesDesdeCriacao = numeroDoMes(mes) - numeroDoMes(reserva.mes_criado)

  if (mesesDesdeCriacao < 0) {
    return false
  }

  return (
    reserva.mes_duracao === null ||
    reserva.mes_duracao === undefined ||
    mesesDesdeCriacao < Number(reserva.mes_duracao)
  )
}

router.get('/', exigirLogin, async (req, res) => {
  const mes = req.query.mes

  if (mes !== undefined && !mesValido(mes)) {
    return res.status(400).json({ erro: 'Mês inválido.' })
  }

  const sql = `
    SELECT * FROM reservas
    WHERE usuarioId = ?
  `

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId])
    const reservasDoMes =
      mes === undefined
        ? resultado
        : resultado.filter((reserva) => reservaVigenteNoMes(reserva, mes))

    const reservas = reservasDoMes.map((r) => {
      const temMeta = Boolean(r.tem_meta)
      const valorMeta = temMeta ? Number(r.valor_meta) : null

      const progresso =
        temMeta && valorMeta > 0
          ? Math.min(100, Math.round((Number(r.valor) / valorMeta) * 100))
          : null

      return {
        ...r,
        tem_meta: temMeta,
        valor_meta: valorMeta,
        progresso,
      }
    })

    res.json(reservas)
  } catch (erro) {
    console.log('Erro ao buscar reservas:', erro)
    res.status(500).json({ erro: 'Erro ao buscar reservas' })
  }
})

router.post('/', exigirLogin, async (req, res) => {
  const { nome, valor, tem_meta, valor_meta, mes_criado, mes_duracao } =
    req.body

  const valorNum = Number(valor)
  const temMeta = tem_meta === true
  const mesDuracao =
    mes_duracao === null || mes_duracao === undefined
      ? null
      : Number(mes_duracao)

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return res.status(400).json({ erro: 'Nome da reserva inválido.' })
  }

  if (!mesValido(mes_criado)) {
    return res.status(400).json({ erro: 'Mês de criação inválido.' })
  }

  if (
    mesDuracao !== null &&
    (!Number.isInteger(mesDuracao) || mesDuracao < 1 || mesDuracao > 2147483647)
  ) {
    return res.status(400).json({ erro: 'Duração da reserva inválida.' })
  }

  if (!Number.isFinite(valorNum) || valorNum < 0) {
    return res.status(400).json({ erro: 'Valor inicial inválido.' })
  }

  if (
    tem_meta &&
    (!Number.isFinite(Number(valor_meta)) || Number(valor_meta) <= 0)
  ) {
    return res.status(400).json({ erro: 'Valor da meta inválido.' })
  }

  if (tem_meta !== undefined && typeof tem_meta !== 'boolean') {
    return res.status(400).json({ erro: 'Configuração de meta inválida.' })
  }

  const metaValor = temMeta ? Number(valor_meta) : null

  const sql = `
    INSERT INTO reservas
    (nome, valor, usuarioId, tem_meta, valor_meta, mes_criado, mes_duracao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `

  const valores = [
    nome.trim(),
    valorNum,
    req.usuarioId,
    temMeta,
    metaValor,
    mes_criado,
    mesDuracao,
  ]

  try {
    const [resultado] = await pool.query(sql, valores)

    const novaReserva = {
      id: resultado.insertId,
      nome: nome.trim(),
      valor: valorNum,
      tem_meta: temMeta,
      valor_meta: metaValor,
      mes_criado,
      mes_duracao: mesDuracao,
    }

    res.status(201).json({
      mensagem: 'Reserva criada',
      reserva: novaReserva,
    })
  } catch (erro) {
    console.log('Erro ao criar reserva:', erro)
    res.status(500).json({ erro: 'Erro ao inserir reserva' })
  }
})

router.delete('/:id', exigirLogin, async (req, res) => {
  const id = req.params.id

  const sql = `
    DELETE FROM reservas
    WHERE id = ? AND usuarioId = ?
  `

  try {
    const [resultado] = await pool.query(sql, [id, req.usuarioId])

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        erro: 'Reserva não encontrada.',
      })
    }

    res.json({
      mensagem: 'Reserva excluída com sucesso',
      id,
    })
  } catch (erro) {
    console.log('Erro ao excluir reserva:', erro)
    res.status(500).json({ erro: 'Erro ao excluir reserva' })
  }
})

router.patch('/:id', exigirLogin, async (req, res) => {
  const id = Number(req.params.id)
  const { tipo, valor } = req.body
  const valorNum = Number(valor)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID inválido.' })
  }

  if (!['adicionar', 'retirar'].includes(tipo)) {
    return res.status(400).json({ erro: 'Tipo inválido.' })
  }

  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    return res.status(400).json({ erro: 'Valor inválido.' })
  }

  const sql =
    tipo === 'adicionar'
      ? `
        UPDATE reservas SET valor = valor + ?
        WHERE id = ? AND usuarioId = ?
      `
      : `
        UPDATE reservas SET valor = valor - ?
        WHERE id = ? AND usuarioId = ? AND valor >= ?
      `

  const valores =
    tipo === 'adicionar'
      ? [valorNum, id, req.usuarioId]
      : [valorNum, id, req.usuarioId, valorNum]

  try {
    const [resultado] = await pool.query(sql, valores)

    if (resultado.affectedRows === 0) {
      if (tipo === 'retirar') {
        return res.status(422).json({
          erro: 'Saldo insuficiente ou reserva não encontrada.',
        })
      }

      return res.status(404).json({
        erro: 'Reserva não encontrada.',
      })
    }

    res.json({
      mensagem: 'Reserva atualizada',
      id,
    })
  } catch (erro) {
    console.log('Erro ao atualizar reserva:', erro)
    res.status(500).json({ erro: 'Erro ao atualizar reserva.' })
  }
})

module.exports = router
