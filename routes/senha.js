require('dotenv').config()

const mysql = require('../db/connection')
const express = require('express')
const crypto = require('crypto')
const nodemailer = require('nodemailer')

//precisa ter cors aqui também?
//precisa ter cors em todo arquivo de node?

const app = express()
app.use(express.json())

app.post('/esqueci-senha', (req, res) => {
  const { email } = req.body
  const emailLimpo = email.trim().toLowerCase()

  if (!emailLimpo) {
    return res.status(400).json({
      erro: 'Email é necessário',
    })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(emailLimpo)) {
    return res.status(400).json({
      erro: 'Digite um email valido',
    })
  }

  mysql.beginTransaction((erro) => {
    if (erro) {
      console.error('Erro ao inicar', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor.',
      })
    }

    const sql = 'SELECT * FROM usuarios WHERE email = ?'
    let userRetornadoBanco

    mysql.query(sql, [emailLimpo], (erro, resul) => {
      if (erro) {
        console.error('Erro ao procurar usuario')

        return res.status(500).json({ erro: 'Erro interno do servidor' })
      }

      if (resul.length === 0) {
        console.error('Nenhum usuario encontrado.')

        return res.status(404).json({ erro: 'Nenhum usuario encontrado.' })
      }

      userRetornadoBanco = resul[0]
      const usuarioId = userRetornadoBanco.id

      const token = crypto.randomBytes(32)

      sql2 = `
        INSERT INTO recuperar-senha
        (usuario_id, token)
        VALUES (?, ?, ?)
      `

      mysql.query(sql2, [usuarioId, token], (erro, resul) => {
        if (erro) {
          console.error('Erro do servidor')

          return res.status(500).json({ erro: 'Erro interno do servidor' })
        }

        mysql.commit((erro) => {
          if (erro) {
            return mysql.rollback(() => {
              console.error('Erro ao finalizar.', erro)
              return res.status(500).json({ erro: 'Erro ao finalizar envio.' })
            })
          }
        })
      })
    })

    const transporter = nodemailer.createTransport({
      host: '',
      port: 587,
      secure: false,
      auth: {
        user: emailLimpo,
        pass: 'sua-senha',
      },
    })
  })
})
