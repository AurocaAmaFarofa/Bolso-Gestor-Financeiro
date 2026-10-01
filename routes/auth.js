const express = require('express')
const jwt = require('jsonwebtoken')
const db = require('../db/connections')
const crypto = require('crypto')

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
  const { googleId, name, email, convite } = req.body

  if (!googleId || !email || !name) {
    return res.status(400).json({
      erro: 'Dados incompletos',
    })
  }

  let conn

  try {
    conn = await db.getConnection()

    const emailLimpo = email.trim().toLowerCase()

    const [existing] = await conn.query(
      'SELECT * FROM usuarios WHERE google_id = ? OR email = ?',
      [googleId, emailLimpo],
    )

    let usuarioId
    let usuarioNome
    let usuarioEmail

    if (existing.length > 0) {
      const usuario = existing[0]

      usuarioId = usuario.id
      usuarioNome = usuario.nome
      usuarioEmail = usuario.email

      // Atualiza google_id se fez cadastro normal antes
      if (!usuario.google_id) {
        await conn.query('UPDATE usuarios SET google_id = ? WHERE id = ?', [
          googleId,
          usuarioId,
        ])
      }
    } else {
      if (!convite) {
        return res.status(403).json({
          erro: 'É necessário um convite para criar uma conta.',
        })
      }

      const tokenHash = crypto
        .createHash('sha256')
        .update(convite)
        .digest('hex')

      await conn.beginTransaction()

      const [convites] = await conn.query(
        `
        SELECT *
        FROM convites
        WHERE token_hash = ?
          AND usado = FALSE
          AND expira_em > NOW()
        LIMIT 1
        FOR UPDATE
        `,
        [tokenHash],
      )

      if (convites.length === 0) {
        await conn.rollback()

        return res.status(403).json({
          erro: 'Convite inválido, expirado ou já utilizado.',
        })
      }

      const conviteValido = convites[0]

      if (
        conviteValido.email &&
        conviteValido.email.toLowerCase() !== emailLimpo
      ) {
        await conn.rollback()

        return res.status(403).json({
          erro: 'Convite vinculado a outro perfil.',
        })
      }

      const [resultadoUsuario] = await conn.query(
        `
        INSERT INTO usuarios
          (google_id, nome, email, senha_hash)
        VALUES (?, ?, ?, ?)
        `,
        [googleId, name, emailLimpo, 'google_oauth'],
      )

      usuarioId = resultadoUsuario.insertId
      usuarioNome = name
      usuarioEmail = emailLimpo

      for (const cat of CATEGORIAS_PADRAO) {
        await conn.query(
          `
          INSERT INTO categorias_gasto
            (usuario_id, nome)
          VALUES (?, ?)
          `,
          [usuarioId, cat],
        )
      }

      const [resultadoConvite] = await conn.query(
        `
        UPDATE convites
        SET usado = TRUE
        WHERE id = ?
          AND usado = FALSE
        `,
        [conviteValido.id],
      )

      if (resultadoConvite.affectedRows === 0) {
        await conn.rollback()

        return res.status(403).json({
          erro: 'Este convite não está disponível.',
        })
      }

      await conn.commit()
    }

    const token = jwt.sign({ sub: usuarioId }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    })

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    })

    return res.json({
      success: true,
      usuario: {
        id: usuarioId,
        nome: usuarioNome,
        email: usuarioEmail,
      },
    })
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback()
      } catch {}
    }

    console.error('Erro no google-login:', error)

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        erro: 'Este email já está cadastrado.',
      })
    }

    return res.status(500).json({
      erro: error.message,
    })
  } finally {
    if (conn) {
      conn.release()
    }
  }
})

module.exports = router
