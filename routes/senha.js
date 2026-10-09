require('dotenv').config()

const conexao = require('../db/connections')
const express = require('express')
const crypto = require('crypto')
// const nodemailer = require('nodemailer')
const bcrypt = require('bcryptjs')
const app = express.Router()

function queryCallback(sql, values, callback) {
  conexao
    .query(sql, values)
    .then(([resultados]) => callback(null, resultados))
    .catch((erro) => callback(erro, null))
}

/*const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'BolsoConnect@gmail.com',
    pass: process.env.SENHA_EMAIL_BOLSO,
  },
})*/

app.post('/esqueci-senha', (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({
      erro: 'Email é necessário.',
    })
  }

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      erro: 'Email inválido.',
    })
  }

  const emailLimpo = email.trim().toLowerCase()

  if (!emailLimpo) {
    return res.status(400).json({
      erro: 'Email é necessário.',
    })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(emailLimpo)) {
    return res.status(400).json({
      erro: 'Digite um email valido.',
    })
  }

  const sql = `
    SELECT * FROM usuarios
    WHERE email = ?
  `

  let userRetornadoBanco

  queryCallback(sql, [emailLimpo], (erro, resul) => {
    if (erro) {
      console.error('Erro ao procurar usuario')

      return res.status(500).json({ erro: 'Erro interno do servidor' })
    }

    if (resul.length === 0) {
      console.error('Erro interno do servidor.')

      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }

    userRetornadoBanco = resul[0]
    const usuarioId = userRetornadoBanco.id

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const expiraEm = new Date(Date.now() + 15 * 60 * 1000)

    const sql2 = `
        INSERT INTO recuperar_senha (usuario_id, token, expira_em)
        VALUES (?, ?, ?)
      `

    queryCallback(sql2, [usuarioId, tokenHash, expiraEm], (erro, resul2) => {
      if (erro) {
        console.error('Erro do servidor')

        return res
          .status(500)
          .json({ erro: 'Não foi possivel anexar no banco' })
      }

      if (resul2.affectedRows === 0) {
        console.error('Erro do servidor')

        return res
          .status(500)
          .json({ erro: 'Não foi possivel anexar no banco' })
      }

      const link = `http://localhost:3000/alterar-senha.html?token=${token}`

      const resposta = {
        mensagem:
          'Se o email estiver cadastrado, você poderá continuar a recuperação.',
      }

      if (process.env.NODE_ENV !== 'production') {
        resposta.linkRecuperacao = link
      }

      return res.status(200).json(resposta)

      /*const mailOptions = {
        from: '"Bolso" <BolsoConnect@gmail.com>',
        to: emailLimpo,
        subject: 'Recuperação de Senha - Bolso',
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>Olá, ${userRetornadoBanco.nome || 'Usuário'}!</h2>
            <p>Você solicitou a recuperação de senha para sua conta no Bolso.</p>
            <p>Clique no botão abaixo para redefinir sua senha. Este link é válido por tempo limitado.</p>
            <a href="${link}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0;">
              Alterar Minha Senha
            </a>
            <p style="font-size: 12px; color: #777;">Se o botão não funcionar, copie e cole este link no seu navegador:<br>${link}</p>
            <p>Se você não solicitou essa alteração, pode ignorar este e-mail com segurança.</p>
          </div>
        `,
      }*/

      /*transporter.sendMail(mailOptions, (erroEmail, info) => {
        if (erroEmail) {
          console.error('Erro ao enviar e-mail:', erroEmail)
          return res.status(500).json({ erro: 'Falha ao enviar o e-mail.' })
        }

        console.log('E-mail enviado:', info.response)

        return res.status(201).json({
          mensagem: 'E-mail de recuperação enviado com sucesso!',
        })
      })*/
    })
  })
})

app.post('/alterar-senha', (req, res) => {
  const { senha, confirmarSenha, token } = req.body

  if (token === null || !token) {
    console.error('Token não existente.')
    return res.status(400).json({ erro: 'Não existe token.' })
  }

  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ erro: 'Token inválido.' })
  }

  if (typeof senha !== 'string' || typeof confirmarSenha !== 'string') {
    return res.status(400).json({
      erro: 'Senha inválida.',
    })
  }

  if (typeof senha !== 'string' || senha.length < 12 || senha.length > 64) {
    return res.status(400).json({
      erro: 'A senha deve ter entre 12 e 64 caracteres.',
    })
  }

  if (!senha) {
    console.error('Senha não identificada.')
    return res.status(400).json({ erro: 'Senha é necessária.' })
  }

  if (!confirmarSenha) {
    console.error('Confirme a senha para continuar.')
    return res.status(400).json({ erro: 'Confirme a senha para continuar.' })
  }

  if (senha !== confirmarSenha) {
    console.error('Senhas não iguais.')
    return res.status(400).json({ erro: 'Senhas não coicídem.' })
  }

  const tokenHashPraVerificar = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex')

  const sql = `
    SELECT * FROM recuperar_senha
    WHERE token = ?
  `

  queryCallback(sql, [tokenHashPraVerificar], (erro, resposta) => {
    if (erro) {
      console.error('Erro interno do servidor.')
      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }

    if (resposta.length === 0) {
      console.error('Token inválido.')
      return res.status(400).json({ erro: 'Token inválido.' })
    }

    const consultaBanco = resposta[0]
    const agora = new Date(Date.now())

    if (consultaBanco.expira_em <= agora) {
      console.error('Token inválido.')
      return res.status(400).json({ erro: 'Token inválido.' })
    }

    if (consultaBanco.usado === 1) {
      console.error('Token inválido.')
      return res.status(400).json({ erro: 'Token inválido.' })
    }

    const userId = consultaBanco.usuario_id
    const idRecuperarSenha = consultaBanco.id

    bcrypt.hash(senha, 12, (erro, senhaHash) => {
      if (erro) {
        return res.status(500).json({
          erro: 'Erro interno do servidor.',
        })
      }

      const sqlUser = `
        UPDATE usuarios
        SET senha_hash = ?
        WHERE id = ?
      `

      queryCallback(sqlUser, [senhaHash, userId], (erro, resposta) => {
        if (erro) {
          return res.status(500).json({ erro: 'Erro interno do servidor.' })
        }

        if (resposta.affectedRows === 0) {
          return res.status(404).json({ erro: 'Usuario não encontrado' })
        }

        const mysql2 = `
          UPDATE recuperar_senha
          SET usado = TRUE
          WHERE id = ?
        `

        queryCallback(mysql2, [idRecuperarSenha], (erro, resposta) => {
          if (erro) {
            return res.status(500).json({ erro: 'Erro interno do servidor.' })
          }

          if (resposta.affectedRows === 0) {
            return res.status(500).json({ erro: 'Erro interno do servidor.' })
          }

          return res
            .status(200)
            .json({ mensagem: 'Senha alterada com sucesso.' })
        })
      })
    })
  })
})

module.exports = app
