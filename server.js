require('dotenv').config()
const mysql = require('mysql2')
const express = require('express')
const app = express()
app.use(express.static(__dirname))
const PORT = 3000

app.use(express.json())

const conexao = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

conexao.connect((erro) => {
  if (erro) {
    console.error('Erro ao conectar:', erro)
    return
  }

  console.log('Conectado ao banco.')
})

app.get('/lancamentos', (req, res) => {
  const sql = 'SELECT * FROM lancamentos'

  conexao.query(sql, (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar lançamentos:', erro)

      res.status(500).json({
        erro: 'Erro ao buscar lançamentos',
      })

      return
    }

    res.json(resultados)
  })
})

app.post('/lancamentos', (req, res) => {
  const { tipo, valor, categoria, descricao, forma, data, mesAno, bancoId } =
    req.body

  const sql = `
  INSERT INTO lancamentos
  (tipo, valor, categoria, descricao, forma, data, mesAno, bancoId)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `

  const valores = [
    tipo,
    valor,
    categoria,
    descricao,
    forma,
    data,
    mesAno,
    bancoId,
  ]

  conexao.query(sql, valores, (erro, resultado) => {
    if (erro) {
      console.log('erro no lançamento', erro)

      res.status(500).json({ erro: 'erro ao inserir lançamento' })

      return
    }

    const novoLancamento = {
      id: resultado.insertId,
      tipo,
      valor,
      categoria,
      descricao,
      forma,
      data,
      mesAno,
      bancoId,
    }

    res.status(201).json({
      mensagem: 'Lançamento criado',
      lancamento: novoLancamento,
    })
  })
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})
