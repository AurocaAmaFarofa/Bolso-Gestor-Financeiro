require('dotenv').config()
const mysql = require('mysql2')
const express = require('express')
const path = require('path')
const bcrypt = require('bcryptjs')
const session = require('express-session')
const app = express()
const PORT = 3000
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
)

const conexao = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
})

conexao.connect((erro) => {
  if (erro) {
    console.error('Erro ao conectar:', erro)
    return
  }

  console.log('Conectado ao banco.')
})

app.get('/lancamentos', exigirLogin, (req, res) => {
  const sql = `
    SELECT * FROM lancamentos
    WHERE usuarioId = ?
  `

  conexao.query(sql, [req.session.usuarioId], (erro, resultados) => {
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

app.post('/lancamentos', exigirLogin, (req, res) => {
  const { tipo, valor, categoria, descricao, forma, data, mesAno, bancoId } =
    req.body

  const sql = `
  INSERT INTO lancamentos
  (tipo, valor, categoria, descricao, forma, data, mesAno, bancoId, usuarioId)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    req.session.usuarioId,
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

app.delete('/lancamentos/:id', exigirLogin, (req, res) => {
  const id = req.params.id

  const sql = `
  DELETE FROM lancamentos
  WHERE id = ? AND usuarioId = ?
  `

  conexao.query(sql, [id, req.session.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao excluir: ', erro)

      res.status(500).json({
        erro: 'Erro ao exlcuir',
      })

      return
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        erro: 'Lançamento não encontrado.',
      })
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

app.get('/bancos', exigirLogin, (req, res) => {
  const sql = `
    SELECT * FROM bancos
    WHERE usuarioId = ?
  `

  conexao.query(sql, [req.session.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao buscar bancos: ', erro)

      return res.status(500).json({
        erro: 'Erro ao buscar bancos.',
      })
    }

    res.json(resultado)
  })
})

app.post('/bancos', exigirLogin, (req, res) => {
  const { nome, saldoInicial, mesCriado } = req.body

  const sql = `
    INSERT INTO bancos
    (nome, saldoInicial, mesCriado, usuarioId)
    VALUES (?, ?, ?, ?)
  `

  const valores = [nome, saldoInicial, mesCriado, req.session.usuarioId]

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

app.delete('/bancos/:id', exigirLogin, (req, res) => {
  const id = req.params.id

  const sqlLancamentos = `
    DELETE FROM lancamentos
    WHERE bancoId = ? AND usuarioId = ?
  `

  conexao.query(sqlLancamentos, [id, req.session.usuarioId], (erro) => {
    if (erro) {
      console.log('Erro ao excluir lançamentos do banco:', erro)

      res.status(500).json({
        erro: 'Erro ao excluir lançamentos do banco',
      })

      return
    }

    const sqlBanco = `
      DELETE FROM bancos
      WHERE id = ? AND usuarioId = ?
    `

    conexao.query(sqlBanco, [id, req.session.usuarioId], (erro, resultado) => {
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

app.get('/reservas', exigirLogin, (req, res) => {
  const sql = `
    SELECT * FROM reservas
    WHERE usuarioId = ?
  `

  conexao.query(sql, [req.session.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao buscar reservas')

      return res.status(500).json({
        erro: 'Erro ao buscar reservas',
      })
    }

    res.json(resultado)
  })
})

app.post('/reservas', exigirLogin, (req, res) => {
  const { nome, valor } = req.body

  const sql = `
    INSERT INTO reservas
    (nome, valor, usuarioId)
    VALUES (?, ?, ?)
  `

  const valores = [nome, valor, req.session.usuarioId]

  conexao.query(sql, valores, (erro, resultado) => {
    if (erro) {
      console.log('erro na reserva', erro)

      res.status(500).json({ erro: 'erro ao inserir reserva' })

      return
    }

    const novaReserva = {
      id: resultado.insertId,
      nome,
      valor,
    }

    res.status(201).json({
      mensagem: 'Reserva criada',
      reserva: novaReserva,
    })
  })
})

app.delete('/reservas/:id', exigirLogin, (req, res) => {
  const id = req.params.id

  const sql = `
    DELETE FROM reservas
    WHERE id = ? AND usuarioId = ?
  `

  conexao.query(sql, [id, req.session.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao excluir reserva:', erro)

      return res.status(500).json({
        erro: 'Erro ao excluir reserva',
      })
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        erro: 'Reserva não encontrada.',
      })
    }

    res.json({
      mensagem: 'Reserva excluída com sucesso',
      id: id,
    })
  })
})

app.post('/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body

  const nomeLimpo = nome?.trim()
  const emailLimpo = email?.trim().toLowerCase()

  if (!nomeLimpo || !emailLimpo || !senha) {
    return res.status(400).json({
      erro: 'Preencha todos os campos.',
    })
  }

  if (senha.length < 6) {
    return res.status(400).json({
      erro: 'A senha deve ter pelo menos 6 caracteres.',
    })
  }

  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(emailLimpo)) {
      return res.status(400).json({
        erro: 'Digite um e-mail válido.',
      })
    }

    const senhaHash = await bcrypt.hash(senha, 12)

    const sql = `
      INSERT INTO usuarios
      (nome, email, senha_hash)
      VALUES (?, ?, ?)
    `

    conexao.query(
      sql,
      [nomeLimpo, emailLimpo, senhaHash],
      (erro, resultado) => {
        if (erro) {
          if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
              erro: 'Este e-mail já está cadastrado.',
            })
          }

          console.error('Erro ao cadastrar usuário:', erro)

          return res.status(500).json({
            erro: 'Erro ao cadastrar usuário.',
          })
        }

        return res.status(201).json({
          mensagem: 'Usuário criado com sucesso!',
          id: resultado.insertId,
        })
      },
    )
  } catch (erro) {
    console.error('Erro no cadastro:', erro)

    return res.status(500).json({
      erro: 'Erro interno do servidor.',
    })
  }
})

app.post('/login', (req, res) => {
  const { email, senha } = req.body

  const sql = 'SELECT * FROM usuarios WHERE email = ?'

  conexao.query(sql, [email], async (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar usuário:', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor',
      })
    }

    if (resultados.length === 0) {
      return res.status(401).json({
        erro: 'Email ou senha incorretos',
      })
    }

    const usuario = resultados[0]

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash)

    if (!senhaCorreta) {
      return res.status(401).json({
        erro: 'Email ou senha incorretos',
      })
    }

    req.session.usuarioId = usuario.id

    res.json({
      mensagem: 'Login realizado com sucesso!',
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    })
  })
})

app.post('/logout', exigirLogin, (req, res) => {
  req.session.destroy((erro) => {
    if (erro) {
      console.error('Erro ao deslogar', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor',
      })
    }

    res.json({
      mensagem: 'Usuario se deslogou do sistema!',
    })
  })
})

app.get('/me', (req, res) => {
  if (!req.session.usuarioId) {
    return res.status(401).json({
      erro: 'Não autenticado',
    })
  }

  res.json({
    usuarioId: req.session.usuarioId,
  })
})

function exigirLogin(req, res, next) {
  if (!req.session.usuarioId) {
    return res.status(401).json({
      erro: 'Você precisa estar logado.',
    })
  }

  next()
}
