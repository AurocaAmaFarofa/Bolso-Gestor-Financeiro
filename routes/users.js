const express = require('express')
const db = require('../db/connections')
const authMiddleware = require('../middleware/auth')
const bcrypt = require('bcryptjs')
const { OAuth2Client } = require('google-auth-library')

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const router = express.Router()

router.delete('/', authMiddleware, async (req, res) => {
  const { senha, credential } = req.body
  const usuarioId = req.usuarioId

  let conn

  try {
    conn = await db.getConnection()
    await conn.beginTransaction()

    const [usuarios] = await conn.query('SELECT * FROM usuarios WHERE id = ?', [
      usuarioId,
    ])

    if (usuarios.length === 0) {
      await conn.rollback()
      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }

    const user = usuarios[0]

    if (user.senha_hash) {
      if (!senha || typeof senha !== 'string') {
        await conn.rollback()
        return res.status(400).json({ erro: 'Senha inválida.' })
      }

      const senhaCorreta = await bcrypt.compare(senha, user.senha_hash)
      if (!senhaCorreta) {
        await conn.rollback()
        return res.status(400).json({ erro: 'Senha incorreta.' })
      }
    } else if (user.google_id) {
      if (!credential) {
        await conn.rollback()
        return res
          .status(400)
          .json({ erro: 'Confirmação do Google é obrigatória.' })
      }

      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        })
        const payload = ticket.getPayload()

        if (payload.sub !== user.google_id) {
          await conn.rollback()
          return res
            .status(400)
            .json({ erro: 'Confirmação do Google inválida.' })
        }
      } catch (erro) {
        await conn.rollback()
        return res.status(400).json({ erro: 'Confirmação do Google inválida.' })
      }
    } else {
      await conn.rollback()
      return res
        .status(400)
        .json({ erro: 'Não foi possível verificar a identidade do usuário.' })
    }

    await conn.query(
      `DELETE l
      FROM lancamentos l
      LEFT JOIN categorias_gasto c ON c.id = l.categoria_id
      WHERE l.usuarioId = ? OR c.usuario_id = ?`,
      [usuarioId, usuarioId],
    )
    await conn.query('DELETE FROM metas WHERE usuario_id = ?', [usuarioId])
    await conn.query('DELETE FROM gastos_fixos WHERE usuario_id = ?', [
      usuarioId,
    ])
    await conn.query('DELETE FROM bancos WHERE usuarioId = ?', [usuarioId])
    await conn.query('DELETE FROM reservas WHERE usuarioId = ?', [usuarioId])

    const [resultado] = await conn.query('DELETE FROM usuarios WHERE id = ?', [
      usuarioId,
    ])

    if (resultado.affectedRows !== 1) {
      await conn.rollback()
      return res.status(404).json({ erro: 'Usuário não encontrado.' })
    }

    await conn.commit()
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return res.status(200).json({ mensagem: 'Usuário excluído com sucesso.' })
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback()
      } catch (erroRollback) {
        console.error('Erro ao desfazer transação:', erroRollback)
      }
    }

    console.error('Erro ao excluir usuário:', error)
    return res.status(500).json({ erro: 'Erro interno do servidor.' })
  } finally {
    if (conn) {
      conn.release()
    }
  }
})

module.exports = router
