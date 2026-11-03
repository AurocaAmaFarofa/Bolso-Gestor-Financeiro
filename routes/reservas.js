const express = require('express')
const router = express.Router()

const pool = require('../db/connections')
const exigirLogin = require('../middleware/auth')

router.get('/', exigirLogin, async (req, res) => {
  const sql = `
    SELECT * FROM reservas
    WHERE usuarioId = ?
  `

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId])

    const reservas = resultado.map((r) => {
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
  const { nome, valor, tem_meta, valor_meta } = req.body

  const valorNum = Number(valor)
  const temMeta = tem_meta === true

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return res.status(400).json({ erro: 'Nome da reserva inválido.' })
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
    (nome, valor, usuarioId, tem_meta, valor_meta)
    VALUES (?, ?, ?, ?, ?)
  `

  const valores = [nome.trim(), valorNum, req.usuarioId, temMeta, metaValor]

  try {
    const [resultado] = await pool.query(sql, valores)

    const novaReserva = {
      id: resultado.insertId,
      nome: nome.trim(),
      valor: valorNum,
      tem_meta: temMeta,
      valor_meta: metaValor,
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
