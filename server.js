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

app.delete('/lancamentos/:id', (req, res) => {
  const id = req.params.id

  console.log(id)

  const sql = `
    DELETE FROM lancamentos
    WHERE id = ?
  `

  conexao.query(sql, [id], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao excluir: ', erro)

      res.status(500).json({
        erro: 'Erro ao exlcuir',
      })

      return
    }

    res.json({
      mensagem: 'Excluido com sucesso',
      id: id,
    })
  })
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})

// Bancos //

app.get('/bancos', (req, res) => {
  const sql = 'SELECT * FROM bancos'

  conexao.query(sql, (erro, resultado) => {
    if (erro) {
      console.log('Erro ao buscar bancos: ', erro)

      res.status(500).json({
        erro: 'Erro ao buscar bancos.',
      })

      return
    }

    res.json(resultado)
  })
})

app.post('/bancos', (req, res) => {
  const { nome, saldoInicial, mesCriado } = req.body

  const sql = `
    INSERT INTO bancos
    (nome, saldoInicial, mesCriado)
    VALUES (?, ?, ?)
  `

  const valores = [nome, saldoInicial, mesCriado]

  conexao.query(sql, valores, (erro, resultado) => {
    if (erro) {
      console.log('Erro ao criar banco:', erro)

      res.status(500).json({
        erro: 'Erro ao criar banco.',
      })

      return
    }

    const novoBanco = {
      id: resultado.insertId,
      nome,
      saldoInicial,
      mesCriado,
    }

    res.status(201).json({
      mensagem: 'Banco criado com sucesso!',
      banco: novoBanco,
    })
  })
})

app.delete('/bancos/:id', (req, res) => {
  const id = req.params.id

  const sqlLancamentos = `
    DELETE FROM lancamentos
    WHERE bancoId = ?
  `

  conexao.query(sqlLancamentos, [id], (erro) => {
    if (erro) {
      console.log('Erro ao excluir lançamentos do banco:', erro)

      res.status(500).json({
        erro: 'Erro ao excluir lançamentos do banco',
      })

      return
    }

    const sqlBanco = `
      DELETE FROM bancos
      WHERE id = ?
    `

    conexao.query(sqlBanco, [id], (erro, resultado) => {
      if (erro) {
        console.log('Erro ao excluir banco:', erro)

        res.status(500).json({
          erro: 'Erro ao excluir banco',
        })

        return
      }

      res.json({
        mensagem: 'Banco excluído com sucesso',
        id: id,
      })
    })
  })
})
