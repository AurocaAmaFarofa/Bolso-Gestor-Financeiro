require('dotenv').config()

const mysql = require('mysql2')
const express = require('express')
const path = require('path')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')

const app = express()

const PORT = 3000

app.use(express.json())
app.use(cookieParser())

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
    })
  },
})

const tentativasLogin = new Map()

function registrarFalhaLogin(email) {
  const agora = Date.now()

  const dados = tentativasLogin.get(email) || {
    falhas: 0,
    bloqueadoAte: null,
  }

  dados.falhas += 1

  if (dados.falhas >= 5) {
    dados.bloqueadoAte = agora + 5 * 60 * 1000
  }

  tentativasLogin.set(email, dados)
}

function verificarBloqueioLogin(email) {
  const dados = tentativasLogin.get(email)

  if (!dados) {
    return null
  }

  const agora = Date.now()

  if (dados.bloqueadoAte && agora < dados.bloqueadoAte) {
    return Math.ceil((dados.bloqueadoAte - agora) / 1000)
  }

  if (dados.bloqueadoAte && agora >= dados.bloqueadoAte) {
    tentativasLogin.delete(email)
  }

  return null
}

function limparTentativasLogin() {
  const agora = Date.now()

  for (const [email, dados] of tentativasLogin.entries()) {
    if (dados.bloqueadoAte && agora >= dados.bloqueadoAte) {
      tentativasLogin.delete(email)
    }
  }
}

setInterval(limparTentativasLogin, 10 * 60 * 1000)

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
    SELECT l.id, l.tipo, l.valor, l.descricao, l.forma, l.data, l.mesAno, l.bancoId,
           l.categoria_id, c.nome AS categoria
    FROM lancamentos l
    JOIN categorias_gasto c ON c.id = l.categoria_id
    WHERE l.usuarioId = ?
  `

  conexao.query(sql, [req.usuarioId], (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar lançamentos:', erro)
      res.status(500).json({ erro: 'Erro ao buscar lançamentos' })
      return
    }

    res.json(resultados)
  })
})

app.post('/lancamentos', exigirLogin, (req, res) => {
  const { tipo, valor, categoriaId, descricao, forma, data, mesAno, bancoId } =
    req.body

  const sqlCategoria = `
    SELECT nome FROM categorias_gasto WHERE id = ? AND usuario_id = ?
  `

  conexao.query(
    sqlCategoria,
    [categoriaId, req.usuarioId],
    (erro, categorias) => {
      if (erro) {
        console.log('erro ao validar categoria', erro)
        return res.status(500).json({ erro: 'erro ao validar categoria' })
      }

      if (categorias.length === 0) {
        return res.status(400).json({ erro: 'Categoria inválida.' })
      }

      const sql = `
      INSERT INTO lancamentos
      (tipo, valor, categoria_id, descricao, forma, data, mesAno, bancoId, usuarioId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

      const valores = [
        tipo,
        valor,
        categoriaId,
        descricao,
        forma,
        data,
        mesAno,
        bancoId,
        req.usuarioId,
      ]

      conexao.query(sql, valores, (erro, resultado) => {
        if (erro) {
          console.log('erro no lançamento', erro)
          return res.status(500).json({ erro: 'erro ao inserir lançamento' })
        }

        res.status(201).json({
          mensagem: 'Lançamento criado',
          lancamento: {
            id: resultado.insertId,
            tipo,
            valor,
            categoriaId,
            categoria: categorias[0].nome,
            descricao,
            forma,
            data,
            mesAno,
            bancoId,
          },
        })
      })
    },
  )
})

app.delete('/lancamentos/:id', exigirLogin, (req, res) => {
  const id = req.params.id

  const sql = `DELETE FROM lancamentos WHERE id = ? AND usuarioId = ?`

  conexao.query(sql, [id, req.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao excluir: ', erro)
      return res.status(500).json({ erro: 'Erro ao exlcuir' })
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Lançamento não encontrado.' })
    }

    res.json({ mensagem: 'Excluido com sucesso', id: id })
  })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})

// Categorias de gasto //

app.get('/categorias', exigirLogin, (req, res) => {
  const sql = `SELECT id, nome FROM categorias_gasto WHERE usuario_id = ? ORDER BY nome`

  conexao.query(sql, [req.usuarioId], (erro, resultados) => {
    if (erro) {
      console.log('Erro ao buscar categorias:', erro)
      return res.status(500).json({ erro: 'Erro ao buscar categorias.' })
    }

    res.json(resultados)
  })
})

app.post('/categorias', exigirLogin, (req, res) => {
  const nome =
    typeof req.body.nome === 'string' ? req.body.nome.trim().toLowerCase() : ''

  if (!nome || nome.length > 100) {
    return res.status(400).json({ erro: 'Nome inválido.' })
  }

  const sql = `INSERT INTO categorias_gasto (usuario_id, nome) VALUES (?, ?)`

  conexao.query(sql, [req.usuarioId, nome], (erro, resultado) => {
    if (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        return res
          .status(409)
          .json({ erro: 'Você já tem uma categoria com esse nome.' })
      }
      console.log('Erro ao criar categoria:', erro)
      return res.status(500).json({ erro: 'Erro ao criar categoria.' })
    }

    res.status(201).json({
      mensagem: 'Categoria criada',
      categoria: { id: resultado.insertId, nome },
    })
  })
})

app.delete('/categorias/:id', exigirLogin, (req, res) => {
  const id = req.params.id

  const sqlFallback = `SELECT id FROM categorias_gasto WHERE usuario_id = ? AND nome = 'outros'`

  conexao.query(sqlFallback, [req.usuarioId], (erro, fallback) => {
    if (erro) {
      console.log('Erro ao localizar categoria "outros":', erro)
      return res.status(500).json({ erro: 'Erro ao excluir categoria.' })
    }

    if (fallback.length === 0 || Number(fallback[0].id) === Number(id)) {
      return res.status(400).json({
        erro: 'Não é possível excluir a categoria "outros", ela recebe os lançamentos das categorias excluídas.',
      })
    }

    const idFallback = fallback[0].id

    const sqlReatribuir = `
      UPDATE lancamentos
      SET categoria_id = ?
      WHERE categoria_id = ? AND usuarioId = ?
    `

    conexao.query(sqlReatribuir, [idFallback, id, req.usuarioId], (erro) => {
      if (erro) {
        console.log('Erro ao reatribuir lançamentos:', erro)
        return res.status(500).json({ erro: 'Erro ao excluir categoria.' })
      }

      const sqlDeletarMetas = `DELETE FROM metas WHERE categoria_id = ? AND usuario_id = ?`

      conexao.query(sqlDeletarMetas, [id, req.usuarioId], (erro) => {
        if (erro) {
          console.log('Erro ao excluir metas da categoria:', erro)
          return res.status(500).json({ erro: 'Erro ao excluir categoria.' })
        }

        const sqlDeletar = `DELETE FROM categorias_gasto WHERE id = ? AND usuario_id = ?`

        conexao.query(sqlDeletar, [id, req.usuarioId], (erro, resultado) => {
          if (erro) {
            console.log('Erro ao excluir categoria:', erro)
            return res.status(500).json({ erro: 'Erro ao excluir categoria.' })
          }

          if (resultado.affectedRows === 0) {
            return res.status(404).json({ erro: 'Categoria não encontrada.' })
          }

          res.json({ mensagem: 'Categoria excluída', id })
        })
      })
    })
  })
})

// Metas //

app.get('/metas', exigirLogin, (req, res) => {
  const sql = `
    SELECT m.id, m.categoria_id, c.nome AS categoria, m.valor_max, m.mes_ano
    FROM metas m
    JOIN categorias_gasto c ON c.id = m.categoria_id
    WHERE m.usuario_id = ?
  `

  conexao.query(sql, [req.usuarioId], (erro, resultados) => {
    if (erro) {
      console.log('Erro ao buscar metas:', erro)
      return res.status(500).json({ erro: 'Erro ao buscar metas.' })
    }

    res.json(resultados)
  })
})

app.post('/metas', exigirLogin, (req, res) => {
  const categoriaId = Number(req.body.categoriaId)
  const valorMax = Number(req.body.valorMax)
  const mesAno = req.body.mesAno

  if (!Number.isInteger(categoriaId)) {
    return res.status(400).json({ erro: 'Categoria inválida.' })
  }

  if (!Number.isFinite(valorMax) || valorMax <= 0) {
    return res.status(400).json({ erro: 'Valor da meta inválido.' })
  }

  if (typeof mesAno !== 'string' || !/^\d{4}-\d{2}$/.test(mesAno)) {
    return res.status(400).json({ erro: 'Mês inválido.' })
  }

  const sql = `
    INSERT INTO metas (usuario_id, categoria_id, valor_max, mes_ano)
    VALUES (?, ?, ?, ?)
  `

  conexao.query(
    sql,
    [req.usuarioId, categoriaId, valorMax, mesAno],
    (erro, resultado) => {
      if (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            erro: 'Você já tem uma meta para essa categoria neste mês.',
          })
        }
        if (erro.code === 'ER_NO_REFERENCED_ROW_2') {
          return res.status(400).json({ erro: 'Categoria inválida.' })
        }
        console.log('Erro ao criar meta:', erro)
        return res.status(500).json({ erro: 'Erro ao criar meta.' })
      }

      res.status(201).json({
        mensagem: 'Meta criada',
        meta: { id: resultado.insertId, categoriaId, valorMax, mesAno },
      })
    },
  )
})

app.delete('/metas/:id', exigirLogin, (req, res) => {
  const sql = `DELETE FROM metas WHERE id = ? AND usuario_id = ?`

  conexao.query(sql, [req.params.id, req.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao excluir meta:', erro)
      return res.status(500).json({ erro: 'Erro ao excluir meta.' })
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Meta não encontrada.' })
    }

    res.json({ mensagem: 'Meta excluída', id: req.params.id })
  })
})

// Bancos //

app.get('/bancos', exigirLogin, (req, res) => {
  const sql = `
    SELECT * FROM bancos
    WHERE usuarioId = ?
  `

  conexao.query(sql, [req.usuarioId], (erro, resultado) => {
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

  const valores = [nome, saldoInicial, mesCriado, req.usuarioId]

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

  conexao.query(sqlLancamentos, [id, req.usuarioId], (erro) => {
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

    conexao.query(sqlBanco, [id, req.usuarioId], (erro, resultado) => {
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

  conexao.query(sql, [req.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao buscar reservas')

      return res.status(500).json({
        erro: 'Erro ao buscar reservas',
      })
    }

    res.json(resultado)
  })
})

// Criar coisa pra aumentar e diminuir valor da reserva

app.post('/reservas', exigirLogin, (req, res) => {
  const { nome, valor } = req.body

  const sql = `
    INSERT INTO reservas
    (nome, valor, usuarioId)
    VALUES (?, ?, ?)
  `

  const valores = [nome, valor, req.usuarioId]

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

  conexao.query(sql, [id, req.usuarioId], (erro, resultado) => {
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

//              CADASTRO

app.post('/cadastro', (req, res) => {
  const { nome, email, senha, confirmarSenha, convite } = req.body

  const nomeLimpo = nome?.trim()
  const emailLimpo = email?.trim().toLowerCase()

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

  if (senha !== confirmarSenha) {
    return res.status(400).json({
      erro: 'As senhas não coincidem.',
    })
  }

  if (!nomeLimpo || !emailLimpo || !senha) {
    return res.status(400).json({
      erro: 'Preencha todos os campos.',
    })
  }

  if (!convite) {
    return res.status(403).json({
      erro: 'É necessário um convite para criar uma conta.',
    })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(emailLimpo)) {
    return res.status(400).json({
      erro: 'Digite um e-mail válido.',
    })
  }

  const tokenHash = crypto.createHash('sha256').update(convite).digest('hex')

  conexao.beginTransaction((erro) => {
    if (erro) {
      console.error('Erro ao iniciar transação:', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor.',
      })
    }

    const sqlConvite = `
      SELECT *
      FROM convites
      WHERE token_hash = ?
        AND usado = FALSE
        AND expira_em > NOW()
      LIMIT 1
      FOR UPDATE
    `

    conexao.query(sqlConvite, [tokenHash], (erro, convites) => {
      if (erro) {
        return conexao.rollback(() => {
          console.error('Erro ao verificar convite:', erro)

          return res.status(500).json({
            erro: 'Erro interno do servidor.',
          })
        })
      }

      if (convites.length === 0) {
        return conexao.rollback(() => {
          return res.status(403).json({
            erro: 'Convite inválido, expirado ou já utilizado.',
          })
        })
      }

      const conviteValido = convites[0]

      if (
        conviteValido.email &&
        conviteValido.email.toLowerCase() !== emailLimpo
      ) {
        return conexao.rollback(() => {
          return res.status(403).json({
            erro: 'Este convite está vinculado a outro e-mail.',
          })
        })
      }

      bcrypt.hash(senha, 12, (erro, senhaHash) => {
        if (erro) {
          return conexao.rollback(() => {
            console.error('Erro ao gerar hash da senha:', erro)

            return res.status(500).json({
              erro: 'Erro interno do servidor.',
            })
          })
        }

        const sqlUsuario = `
          INSERT INTO usuarios
          (nome, email, senha_hash)
          VALUES (?, ?, ?)
        `

        conexao.query(
          sqlUsuario,
          [nomeLimpo, emailLimpo, senhaHash],
          (erro, resultadoUsuario) => {
            if (erro) {
              return conexao.rollback(() => {
                if (erro.code === 'ER_DUP_ENTRY') {
                  return res.status(409).json({
                    erro: 'Este e-mail já está cadastrado.',
                  })
                }

                console.error('Erro ao cadastrar usuário:', erro)

                return res.status(500).json({
                  erro: 'Erro ao cadastrar usuário.',
                })
              })
            }

            const sqlUsarConvite = `
              UPDATE convites
              SET usado = TRUE
              WHERE id = ?
                AND usado = FALSE
            `

            conexao.query(
              sqlUsarConvite,
              [conviteValido.id],
              (erro, resultadoUpdate) => {
                if (erro || resultadoUpdate.affectedRows === 0) {
                  return conexao.rollback(() => {
                    console.error('Erro ao utilizar convite:', erro)

                    return res.status(500).json({
                      erro: 'Erro ao finalizar o cadastro.',
                    })
                  })
                }

                conexao.commit((erro) => {
                  if (erro) {
                    return conexao.rollback(() => {
                      console.error('Erro ao finalizar transação:', erro)
                      return res.status(500).json({
                        erro: 'Erro ao finalizar o cadastro.',
                      })
                    })
                  }

                  const token = jwt.sign(
                    { sub: resultadoUsuario.insertId },
                    process.env.JWT_SECRET,
                    {
                      expiresIn: '1d',
                    },
                  )

                  res.cookie('token', token, {
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 1000 * 60 * 60 * 24,
                  })

                  return res.status(201).json({
                    mensagem: 'Usuário criado com sucesso!',
                    id: resultadoUsuario.insertId,
                  })
                })
              },
            )
          },
        )
      })
    })
  })
})

app.post('/login', loginLimiter, (req, res) => {
  const { email, senha } = req.body

  if (
    typeof email !== 'string' ||
    typeof senha !== 'string' ||
    !email.trim() ||
    !senha
  ) {
    return res.status(400).json({
      erro: 'Email e senha são obrigatórios.',
    })
  }

  const emailN = email.trim().toLowerCase()

  const segundosRestantes = verificarBloqueioLogin(emailN)

  if (segundosRestantes !== null) {
    return res.status(429).json({
      erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
    })
  }

  const sql = 'SELECT * FROM usuarios WHERE email = ?'

  conexao.query(sql, [emailN], async (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar usuário:', erro)

      return res.status(500).json({
        erro: 'Erro interno do servidor',
      })
    }

    if (resultados.length === 0) {
      registrarFalhaLogin(emailN)

      return res.status(401).json({
        erro: 'Email ou senha incorretos',
      })
    }

    const usuario = resultados[0]

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash)

    if (!senhaCorreta) {
      registrarFalhaLogin(emailN)

      return res.status(401).json({
        erro: 'Email ou senha incorretos',
      })
    }

    tentativasLogin.delete(emailN)

    const token = jwt.sign({ sub: usuario.id }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    })

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24,
    })

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

app.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  res.json({
    mensagem: 'Usuário se deslogou do sistema!',
  })
})

app.get('/me', (req, res) => {
  res.json({
    usuarioId: req.usuarioId,
  })
})

function exigirLogin(req, res, next) {
  const token = req.cookies.token

  if (!token) {
    return res.status(401).json({ erro: 'Você precisa estar logado.' })
  }

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET)

    req.usuarioId = decodificado.sub

    next()
  } catch (erro) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' })
  }
}

//convites

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
  exigirLogin(req, res, () => {
    const sql = `
    SELECT role
    FROM usuarios
    WHERE id = ?
  `

    conexao.query(sql, [req.usuarioId], (erro, resultados) => {
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
  })
}

app.get('/usuario-atual', exigirLogin, (req, res) => {
  const sql = `
    SELECT id, nome, email
    FROM usuarios
    WHERE id = ?
    LIMIT 1
  `

  conexao.query(sql, [req.usuarioId], (erro, resultados) => {
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

  if (!emailLimpo) {
    return res.status(400).json({
      erro: 'Informe um e-mail para gerar o convite.',
    })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(emailLimpo)) {
    return res.status(400).json({
      erro: 'Digite um e-mail válido.',
    })
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

//Gastos Fixos

app.get('/gastos-fixos', exigirLogin, (req, res) => {
  const sql = `
    SELECT id, nome, valor, status
    FROM gastos_fixos
    WHERE usuario_id = ?
  `

  conexao.query(sql, [req.usuarioId], (erro, resultados) => {
    if (erro) {
      console.log('Erro ao buscar gastos fixos:', erro)

      return res.status(500).json({
        erro: 'Erro ao buscar gastos fixos.',
      })
    }

    res.json(resultados)
  })
})

app.post('/gastos-fixos', exigirLogin, (req, res) => {
  const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : ''
  const valor = Number(req.body.valor)

  if (!nome || nome.length > 100) {
    return res.status(400).json({ erro: 'Nome inválido.' })
  }

  if (!Number.isFinite(valor) || valor <= 0) {
    return res.status(400).json({ erro: 'Valor inválido.' })
  }

  const sql = `
    INSERT INTO gastos_fixos
    (usuario_id, nome, valor)
    VALUES (?, ?, ?)
  `

  conexao.query(sql, [req.usuarioId, nome, valor], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao criar gasto fixo:', erro)

      return res.status(500).json({
        erro: 'Erro ao criar gasto fixo.',
      })
    }

    res.status(201).json({
      mensagem: 'Gasto fixo criado',
      gastoFixo: {
        id: resultado.insertId,
        nome,
        valor,
        status: 'pendente',
      },
    })
  })
})

app.patch('/gastos-fixos/:id', exigirLogin, (req, res) => {
  const { status } = req.body

  if (!['pendente', 'pago'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' })
  }

  const sql = `
    UPDATE gastos_fixos
    SET status = ?
    WHERE id = ? AND usuario_id = ?
  `

  conexao.query(
    sql,
    [status, req.params.id, req.usuarioId],
    (erro, resultado) => {
      if (erro) {
        console.log('Erro ao atualizar gasto fixo:', erro)

        return res.status(500).json({ erro: 'Erro ao atualizar gasto fixo.' })
      }

      if (resultado.affectedRows === 0) {
        return res.status(404).json({ erro: 'Gasto fixo não encontrado.' })
      }

      res.json({ mensagem: 'Status atualizado', status })
    },
  )
})

app.delete('/gastos-fixos/:id', exigirLogin, (req, res) => {
  const sql = `
    DELETE FROM gastos_fixos
    WHERE id = ? AND usuario_id = ?
  `

  conexao.query(sql, [req.params.id, req.usuarioId], (erro, resultado) => {
    if (erro) {
      console.log('Erro ao excluir gasto fixo:', erro)

      return res.status(500).json({ erro: 'Erro ao excluir gasto fixo.' })
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Gasto fixo não encontrado.' })
    }

    res.json({ mensagem: 'Gasto fixo excluído', id: req.params.id })
  })
})
