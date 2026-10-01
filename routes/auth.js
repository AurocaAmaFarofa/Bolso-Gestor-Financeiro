const express = require('express')
const jwt = require('jsonwebtoken')
const db = require('../db/connections')

const router = express.Router()

const CATEGORIAS_PADRAO = [
  'alimentação',
  'lazer',
  'transporte',
  'moradia',
  'saúde',
  'contas',
  'outros',
]

router.post('/google-login', async (req, res) => {
  const { googleId, name, email } = req.body

  if (!googleId || !email || !name) {
    return res.status(400).json({ erro: 'Dados incompletos' })
  }

  try {
    const conn = await db.getConnection()

    const [existing] = await conn.query(
      'SELECT * FROM usuarios WHERE google_id = ? OR email = ?',
      [googleId, email],
    )

    let usuarioId

    if (existing.length > 0) {
      usuarioId = existing[0].id
      // Atualiza google_id se fez cadastro normal antes
      if (!existing[0].google_id) {
        await conn.query('UPDATE usuarios SET google_id = ? WHERE id = ?', [
          googleId,
          usuarioId,
        ])
      }
    } else {
      const [result] = await conn.query(
        'INSERT INTO usuarios (google_id, nome, email, senha_hash) VALUES (?, ?, ?, ?)',
        [googleId, name, email, 'google_oauth'],
      )
      usuarioId = result.insertId

      // Cria categorias padrão
      for (const cat of CATEGORIAS_PADRAO) {
        await conn.query(
          'INSERT INTO categorias_gasto (usuario_id, nome) VALUES (?, ?)',
          [usuarioId, cat],
        )
      }
    }

    conn.release()

    const token = jwt.sign({ sub: usuarioId }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    })

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    })

    res.json({
      success: true,
      usuario: { id: usuarioId, nome: name, email },
    })
  } catch (error) {
    console.error('Erro no google-login:', error)
    res.status(500).json({ erro: error.message })
  }
})

module.exports = router
