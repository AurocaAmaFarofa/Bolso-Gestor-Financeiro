require('dotenv').config()

const express = require('express')
const db = require('../db/connections')
const authMiddleware = require('../middleware/auth')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const { OAuth2Client } = require('google-auth-library')

const router = express.Router()

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const transporter = nodemailer.createTransport({
  service: 'gmail',
  family: 4,
  auth: {
    user: process.env.EMAIL_USER || 'BolsoConnect@gmail.com',
    pass: process.env.NODE_MAILER,
  },
})

const MAX_TENTATIVAS = 5
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000

function hashCodigo(codigo) {
  return crypto.createHash('sha256').update(codigo).digest('hex')
}

function codigoCorreto(codigo, codigoHash) {
  const hashRecebido = Buffer.from(hashCodigo(codigo), 'hex')
  const hashArmazenado = Buffer.from(codigoHash, 'hex')

  return (
    hashRecebido.length === hashArmazenado.length &&
    crypto.timingSafeEqual(hashRecebido, hashArmazenado)
  )
}

async function verificarIdentidade(user, { senha, credential }) {
  // Contas Google precisam de uma nova confirmação Google
  if (user.google_id) {
    if (typeof credential !== 'string' || !credential) {
      return {
        valido: false,
        status: 400,
        erro: 'Confirmação do Google é obrigatória.',
      }
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      })

      const payload = ticket.getPayload()

      if (
        !payload ||
        payload.sub !== user.google_id ||
        payload.email_verified !== true
      ) {
        return {
          valido: false,
          status: 400,
          erro: 'Confirmação do Google inválida.',
        }
      }

      return { valido: true }
    } catch (erro) {
      return {
        valido: false,
        status: 400,
        erro: 'Confirmação do Google inválida.',
      }
    }
  }

  // Contas tradicionais precisam da senha cadastrada
  if (typeof senha !== 'string' || !senha) {
    return {
      valido: false,
      status: 400,
      erro: 'Senha é obrigatória.',
    }
  }

  if (
    typeof user.senha_hash !== 'string' ||
    !user.senha_hash ||
    user.senha_hash === 'google_oauth'
  ) {
    return {
      valido: false,
      status: 400,
      erro: 'Não foi possível verificar a identidade do usuário.',
    }
  }

  const senhaCorreta = await bcrypt.compare(senha, user.senha_hash)

  if (!senhaCorreta) {
    return {
      valido: false,
      status: 400,
      erro: 'Senha incorreta.',
    }
  }

  return { valido: true }
}

// Solicitar código de confirmação
router.post('/excluir-conta/solicitar', authMiddleware, async (req, res) => {
  const usuarioId = req.usuarioId

  try {
    if (
      !process.env.NODE_MAILER ||
      !(process.env.EMAIL_USER || 'BolsoConnect@gmail.com')
    ) {
      return res.status(503).json({
        erro: 'O serviço de envio de e-mail não está configurado.',
      })
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        erro: 'O serviço de autenticação não está configurado.',
      })
    }

    const [usuarios] = await db.query(
      `SELECT id, nome, email, senha_hash, google_id
       FROM usuarios
       WHERE id = ?`,
      [usuarioId]
    )

    if (usuarios.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.',
      })
    }

    const user = usuarios[0]

    if (!user.email) {
      return res.status(400).json({
        erro: 'A conta não possui um e-mail cadastrado.',
      })
    }

    const verificacao = await verificarIdentidade(user, req.body || {})

    if (!verificacao.valido) {
      return res.status(verificacao.status).json({
        erro: verificacao.erro,
      })
    }

    const codigo = crypto.randomInt(0, 10000).toString().padStart(4, '0')
    const codigoHash = hashCodigo(codigo)

    const expiraEm = new Date(Date.now() + TEMPO_EXPIRACAO_MS)

    // Invalida códigos anteriores antes de gerar uma nova solicitação
    await db.query(
      `UPDATE confirmacoes_exclusao
       SET usado = TRUE
       WHERE usuario_id = ? AND usado = FALSE`,
      [usuarioId]
    )

    await db.query(
      `INSERT INTO confirmacoes_exclusao
       (usuario_id, codigo_hash, expira_em)
       VALUES (?, ?, ?)`,
      [usuarioId, codigoHash, expiraEm]
    )

    try {
      await transporter.sendMail({
        from:
          '"Bolso" <' +
          (process.env.EMAIL_USER || 'BolsoConnect@gmail.com') +
          '>',
        to: user.email,
        subject: 'Confirmação de exclusão da conta - Bolso',
        text: `Você solicitou a exclusão da sua conta Bolso.

Seu código de confirmação é: ${codigo}

O código expira em 10 minutos e pode ser utilizado apenas uma vez.

Se você não solicitou essa operação, ignore este e-mail.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; color: #333;">
            <h2>Confirmação de exclusão</h2>
            <p>Você solicitou a exclusão da sua conta Bolso.</p>
            <p>Utilize o código abaixo para confirmar:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; text-align: center;">
              ${codigo}
            </div>
            <p>Este código expira em 10 minutos e só pode ser utilizado uma vez.</p>
            <p>Se você não solicitou essa operação, ignore este e-mail.</p>
          </div>
        `,
      })
    } catch (erroEmail) {
      console.error('Erro ao enviar código de exclusão:', erroEmail)

      // Invalida o código se o envio falhar
      await db.query(
        `UPDATE confirmacoes_exclusao
         SET usado = TRUE
         WHERE usuario_id = ? AND codigo_hash = ?`,
        [usuarioId, codigoHash]
      )

      return res.status(502).json({
        erro: 'Não foi possível enviar o e-mail de confirmação.',
      })
    }

    return res.status(200).json({
      mensagem: 'Código de confirmação enviado para o e-mail cadastrado.',
      expiraEmSegundos: 600,
    })
  } catch (erro) {
    console.error('Erro ao solicitar exclusão:', erro)

    return res.status(500).json({
      erro: 'Erro interno do servidor.',
    })
  }
})

// Confirmar código e executar a exclusão
router.post('/excluir-conta/confirmar', authMiddleware, async (req, res) => {
  const usuarioId = req.usuarioId
  const { codigo } = req.body || {}

  if (typeof codigo !== 'string' || !/^\d{4}$/.test(codigo)) {
    return res.status(400).json({
      erro: 'Informe um código válido de quatro dígitos.',
    })
  }

  let conn

  try {
    conn = await db.getConnection()
    await conn.beginTransaction()

    // Bloqueia a solicitação durante a validação para evitar reutilização
    const [confirmacoes] = await conn.query(
      `SELECT id, codigo_hash, expira_em, tentativas
       FROM confirmacoes_exclusao
       WHERE usuario_id = ? AND usado = FALSE
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [usuarioId]
    )

    if (confirmacoes.length === 0) {
      await conn.rollback()

      return res.status(400).json({
        erro: 'Nenhuma confirmação pendente. Solicite um novo código.',
      })
    }

    const confirmacao = confirmacoes[0]

    if (new Date(confirmacao.expira_em).getTime() <= Date.now()) {
      await conn.query(
        `UPDATE confirmacoes_exclusao
         SET usado = TRUE
         WHERE id = ?`,
        [confirmacao.id]
      )

      await conn.commit()

      return res.status(400).json({
        erro: 'Código expirado. Solicite um novo código.',
      })
    }

    if (confirmacao.tentativas >= MAX_TENTATIVAS) {
      await conn.query(
        `UPDATE confirmacoes_exclusao
         SET usado = TRUE
         WHERE id = ?`,
        [confirmacao.id]
      )

      await conn.commit()

      return res.status(429).json({
        erro: 'Limite de tentativas atingido. Solicite um novo código.',
      })
    }

    if (!codigoCorreto(codigo, confirmacao.codigo_hash)) {
      const novasTentativas = confirmacao.tentativas + 1
      const bloquear = novasTentativas >= MAX_TENTATIVAS

      await conn.query(
        `UPDATE confirmacoes_exclusao
         SET tentativas = ?, usado = ?
         WHERE id = ?`,
        [novasTentativas, bloquear, confirmacao.id]
      )

      await conn.commit()

      return res.status(400).json({
        erro: bloquear
          ? 'Limite de tentativas atingido. Solicite um novo código.'
          : 'Código incorreto.',
        tentativasRestantes: Math.max(0, MAX_TENTATIVAS - novasTentativas),
      })
    }

    // A confirmação é válida. Exclui os dados financeiros na mesma transação.=
    await conn.query(
      `DELETE l
       FROM lancamentos l
       LEFT JOIN categorias_gasto c ON c.id = l.categoria_id
       WHERE l.usuarioId = ? OR c.usuario_id = ?`,
      [usuarioId, usuarioId]
    )

    await conn.query('DELETE FROM metas WHERE usuario_id = ?', [usuarioId])

    await conn.query('DELETE FROM gastos_fixos WHERE usuario_id = ?', [
      usuarioId,
    ])

    await conn.query('DELETE FROM bancos WHERE usuarioId = ?', [usuarioId])

    await conn.query('DELETE FROM reservas WHERE usuarioId = ?', [usuarioId])

    await conn.query('DELETE FROM categorias_gasto WHERE usuario_id = ?', [
      usuarioId,
    ])

    const [resultado] = await conn.query('DELETE FROM usuarios WHERE id = ?', [
      usuarioId,
    ])

    if (resultado.affectedRows !== 1) {
      throw new Error('Não foi possível excluir o usuário.')
    }

    await conn.commit()

    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    return res.status(200).json({
      mensagem: 'Conta excluída com sucesso.',
    })
  } catch (erro) {
    if (conn) {
      try {
        await conn.rollback()
      } catch (erroRollback) {
        console.error('Erro ao desfazer transação:', erroRollback)
      }
    }

    console.error('Erro ao confirmar exclusão:', erro)

    return res.status(500).json({
      erro: 'Erro interno do servidor.',
    })
  } finally {
    if (conn) {
      conn.release()
    }
  }
})

// Impede que a rota antiga exclua uma conta sem confirmação por e-mail
router.delete('/', authMiddleware, (req, res) => {
  return res.status(409).json({
    erro: 'A exclusão agora exige confirmação por e-mail.',
    solicitar: '/usuarios/excluir-conta/solicitar',
    confirmar: '/usuarios/excluir-conta/confirmar',
  })
})

module.exports = router
