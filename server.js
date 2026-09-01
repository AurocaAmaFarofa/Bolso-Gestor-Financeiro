require('dotenv').config()

const mysql = require('mysql2')
const express = require('express')
const path = require('path')
const bcrypt = require('bcryptjs')
const session = require('express-session')
const crypto = require('crypto')

const app = express()

const PORT = 3000

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

app.get('/convites.html', exigirAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'convites.html'))
})

app.use(express.static(path.join(__dirname, 'public')))

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
  const { nome, email, senha, convite } = req.body

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

  if (!convite) {
    return res.status(403).json({
      erro: 'É necessário um convite para criar uma conta.',
    })
  }

  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(emailLimpo)) {
      return res.status(400).json({
        erro: 'Digite um e-mail válido.',
      })
    }

    const tokenHash = crypto.createHash('sha256').update(convite).digest('hex')

    const sqlConvite = `
      SELECT *
      FROM convites
      WHERE token_hash = ?
        AND usado = FALSE
        AND expira_em > NOW()
      LIMIT 1
    `

    conexao.query(sqlConvite, [tokenHash], async (erro, convites) => {
      if (erro) {
        console.error('Erro ao verificar convite:', erro)

        return res.status(500).json({
          erro: 'Erro interno do servidor.',
        })
      }

      if (convites.length === 0) {
        return res.status(403).json({
          erro: 'Convite inválido, expirado ou já utilizado.',
        })
      }

      const conviteValido = convites[0]
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

          const sqlUsarConvite = `
              UPDATE convites
              SET usado = TRUE
              WHERE id = ?
            `

          conexao.query(sqlUsarConvite, [conviteValido.id], (erro) => {
            if (erro) {
              console.error(
                'Usuário criado, mas houve erro ao marcar convite:',
                erro,
              )

              return res.status(500).json({
                erro: 'Usuário criado, mas houve um erro ao finalizar o convite.',
              })
            }

            req.session.usuarioId = resultado.insertId

            return res.status(201).json({
              mensagem: 'Usuário criado com sucesso!',
              id: resultado.insertId,
            })
          })
        },
      )
    })
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

app.post('/convites', exigirLogin, exigirAdmin, (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({
      erro: 'Informe o email do convite.',
    })
  }

  const token = crypto.randomBytes(32).toString('hex')

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const expiraEm = new Date(Date.now() + 15 * 60 * 1000)

  const sql = `
    INSERT INTO convites
    (email, token_hash, expira_em)
    VALUES (?, ?, ?)
  `

  conexao.query(sql, [email, tokenHash, expiraEm], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao criar convite:', erro)

      return res.status(500).json({
        erro: 'Erro ao criar convite.',
      })
    }

    const linkConvite = `http://localhost:3000/cadastro.html?convite=${token}`

    res.status(201).json({
      mensagem: 'Convite criado com sucesso.',
      id: resultado.insertId,
      convite: linkConvite,
      expiraEm,
    })
  })
})

app.get('/convites/verificar', (req, res) => {
  const { token } = req.query

  if (!token) {
    return res.status(400).json({
      valido: false,
      erro: 'Token não informado.',
    })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const sql = `
    SELECT id, email, expira_em, usado
    FROM convites
    WHERE token_hash = ?
  `

  conexao.query(sql, [tokenHash], (erro, resultados) => {
    if (erro) {
      console.log('Erro ao verificar convite:', erro)

      return res.status(500).json({
        valido: false,
        erro: 'Erro interno do servidor.',
      })
    }

    if (resultados.length === 0) {
      return res.status(400).json({
        valido: false,
        erro: 'Convite inválido.',
      })
    }

    const convite = resultados[0]

    if (convite.usado) {
      return res.status(400).json({
        valido: false,
        erro: 'Este convite já foi utilizado.',
      })
    }

    if (new Date(convite.expira_em) <= new Date()) {
      return res.status(400).json({
        valido: false,
        erro: 'Este convite expirou.',
      })
    }

    res.json({
      valido: true,
      email: convite.email,
    })
  })
})

function exigirAdmin(req, res, next) {
  if (!req.session || !req.session.usuarioId) {
    return res.status(401).json({
      erro: 'Você precisa estar logado.',
    })
  }

  const sql = `
    SELECT role
    FROM usuarios
    WHERE id = ?
  `

  conexao.query(sql, [req.session.usuarioId], (erro, resultados) => {
    if (erro) {
      console.error('Erro ao verificar administrador:', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor.',
      })
    }

    if (resultados.length === 0) {
      return res.status(401).json({
        erro: 'Usuário não encontrado.',
      })
    }

    if (resultados[0].role !== 'admin') {
      return res.status(403).json({
        erro: 'Acesso permitido apenas para administradores.',
      })
    }

    next()
  })
}

app.get('/usuario-atual', exigirLogin, (req, res) => {
  const sql = `
    SELECT id, nome, email
    FROM usuarios
    WHERE id = ?
    LIMIT 1
  `

  conexao.query(sql, [req.session.usuarioId], (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar usuário atual:', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor.',
      })
    }

    if (resultados.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.',
      })
    }

    return res.json({
      id: resultados[0].id,
      nome: resultados[0].nome,
      email: resultados[0].email,
    })
  })
})

app.post('/convites', exigirAdmin, (req, res) => {
  console.log('POST /convites recebido')
  console.log('Dados recebidos:', req.body)

  const { email, validade } = req.body

  const emailLimpo = email?.trim().toLowerCase() || null

  const validades = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }

  if (!validades[validade]) {
    return res.status(400).json({
      erro: 'Validade do convite inválida.',
    })
  }

  if (emailLimpo) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(emailLimpo)) {
      return res.status(400).json({
        erro: 'Digite um e-mail válido.',
      })
    }
  }

  const token = crypto.randomBytes(32).toString('hex')

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const expiraEm = new Date(Date.now() + validades[validade])

  const sql = `
    INSERT INTO convites
    (email, token_hash, expira_em)
    VALUES (?, ?, ?)
  `

  conexao.query(sql, [emailLimpo, tokenHash, expiraEm], (erro, resultado) => {
    if (erro) {
      console.error('Erro ao criar convite:', erro)

      return res.status(500).json({
        erro: 'Erro ao gerar convite.',
      })
    }

    console.log(`Convite criado com sucesso! ID: ${resultado.insertId}`)

    const link =
      `${req.protocol}://${req.get('host')}` + `/cadastro.html?convite=${token}`

    return res.status(201).json({
      mensagem: 'Convite gerado com sucesso!',
      id: resultado.insertId,
      link,
      expiraEm,
    })
  })
})

app.get('/convites', exigirAdmin, (req, res) => {
  const sql = `
    SELECT
      id,
      email,
      expira_em,
      usado,
      criado_em
    FROM convites
    ORDER BY criado_em DESC
  `

  conexao.query(sql, (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar convites:', erro)

      return res.status(500).json({
        erro: 'Erro ao buscar convites.',
      })
    }

    return res.json(resultados)
  })
})
