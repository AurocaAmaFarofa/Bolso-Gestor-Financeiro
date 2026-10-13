const express = require('express')
const jwt = require('jsonwebtoken')
const db = require('../db/connections')
const crypto = require('crypto')
const { OAuth2Client } = require('google-auth-library')

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

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
  const { credential, convite } = req.body || {}

  if (typeof credential !== 'string' || !credential.trim()) {
    return res.status(401).json({
      success: false,
      erro: 'Credencial do Google não enviada.',
    })
  }

  let payload

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    payload = ticket.getPayload()
  } catch (error) {
    return res.status(401).json({
      success: false,
      erro: 'A autenticação com o Google é inválida ou expirou.',
    })
  }

  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof payload.email !== 'string' ||
    !payload.email ||
    payload.email_verified !== true
  ) {
    return res.status(401).json({
      success: false,
      erro: 'Não foi possível validar sua conta Google.',
    })
  }

  const googleId = payload.sub
  const emailLimpo = payload.email.trim().toLowerCase()
  const nome =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : emailLimpo.split('@')[0]

  const conviteToken =
    typeof convite === 'string' && convite.trim() ? convite.trim() : null

  let conn
  let transacaoAberta = false

  try {
    conn = await db.getConnection()

    const [contasGoogle] = await conn.query(
      'SELECT id, nome, email FROM usuarios WHERE google_id = ? LIMIT 1',
      [googleId],
    )

    let usuarioId
    let usuarioNome
    let usuarioEmail

    if (contasGoogle.length > 0) {
      const usuario = contasGoogle[0]

      usuarioId = usuario.id
      usuarioNome = usuario.nome
      usuarioEmail = usuario.email
    } else {
      const [contasEmail] = await conn.query(
        'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
        [emailLimpo],
      )

      if (contasEmail.length > 0) {
        return res.status(409).json({
          success: false,
          erro: 'Este e-mail já possui uma conta. Entre pela forma de login original para vincular o Google com segurança.',
        })
      }

      if (!conviteToken) {
        return res.status(403).json({
          success: false,
          erro: 'É necessário um convite para criar uma conta.',
        })
      }

      const tokenHash = crypto
        .createHash('sha256')
        .update(conviteToken)
        .digest('hex')

      await conn.beginTransaction()
      transacaoAberta = true

      const [listaConvites] = await conn.query(
        'SELECT id, email, expira_em, usado FROM convites WHERE token = ? LIMIT 1 FOR UPDATE',
        [tokenHash],
      )

      if (listaConvites.length === 0) {
        await conn.rollback()
        transacaoAberta = false

        return res.status(403).json({
          success: false,
          erro: 'Convite inválido.',
        })
      }

      const conviteBanco = listaConvites[0]

      if (Number(conviteBanco.usado) !== 0) {
        await conn.rollback()
        transacaoAberta = false

        return res.status(403).json({
          success: false,
          erro: 'Este convite já foi utilizado.',
        })
      }

      if (
        conviteBanco.expira_em &&
        new Date(conviteBanco.expira_em).getTime() <= Date.now()
      ) {
        await conn.rollback()
        transacaoAberta = false

        return res.status(403).json({
          success: false,
          erro: 'Este convite expirou.',
        })
      }

      const emailConvite =
        typeof conviteBanco.email === 'string'
          ? conviteBanco.email.trim().toLowerCase()
          : null

      if (emailConvite && emailConvite !== emailLimpo) {
        await conn.rollback()
        transacaoAberta = false

        return res.status(403).json({
          success: false,
          erro: 'Este convite não foi emitido para o e-mail da conta Google utilizada.',
        })
      }

      const [resultadoUsuario] = await conn.query(
        'INSERT INTO usuarios (google_id, nome, email, senha_hash) VALUES (?, ?, ?, ?)',
        [googleId, nome, emailLimpo, 'google_oauth'],
      )

      usuarioId = resultadoUsuario.insertId
      usuarioNome = nome
      usuarioEmail = emailLimpo

      const categoriasPadrao = [
        'alimentação',
        'lazer',
        'transporte',
        'moradia',
        'saúde',
        'contas',
        'outros',
      ]

      for (const categoria of categoriasPadrao) {
        await conn.query(
          'INSERT INTO categorias (usuario_id, nome) VALUES (?, ?)',
          [usuarioId, categoria],
        )
      }

      const [resultadoConvite] = await conn.query(
        'UPDATE convites SET usado = 1 WHERE id = ? AND usado = 0',
        [conviteBanco.id],
      )

      if (resultadoConvite.affectedRows !== 1) {
        await conn.rollback()
        transacaoAberta = false

        return res.status(409).json({
          success: false,
          erro: 'Não foi possível utilizar este convite. Tente novamente.',
        })
      }

      await conn.commit()
      transacaoAberta = false
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
    if (conn && transacaoAberta) {
      try {
        await conn.rollback()
      } catch (erroRollback) {
        console.error('Erro ao desfazer a transação:', erroRollback)
      }
    }

    console.error('Erro no login Google:', error)

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        erro: 'Já existe uma conta com esses dados ou o convite acabou de ser utilizado.',
      })
    }

    return res.status(500).json({
      success: false,
      erro: 'Ocorreu um erro interno ao autenticar sua conta.',
    })
  } finally {
    if (conn) {
      conn.release()
    }
  }
})

module.exports = router
