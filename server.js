require('dotenv').config()

const express = require('express')
const path = require('path')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000
const pool = require('./db/connections')

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://bolso-gestor-financeiro.onrender.com',
      process.env.FRONTEND_URL,
    ].filter(Boolean)

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Não permitido por CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
}

app.set('trust proxy', 1)

const authMiddleware = require('./middleware/auth')
const authRoutes = require('./routes/auth')
const senhas = require('./routes/senha')
const users = require('./routes/users')

app.use(cors(corsOptions))

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/senhas', senhas)
app.use('/usuarios', users)

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

const exigirLogin = authMiddleware

app.get('/lancamentos', exigirLogin, async (req, res) => {
  const sql = `
    SELECT l.id, l.tipo, l.valor, l.descricao, l.forma, l.data, l.mesAno, l.bancoId,
           l.categoria_id, c.nome AS categoria
    FROM lancamentos l
    JOIN categorias_gasto c ON c.id = l.categoria_id
    WHERE l.usuarioId = ?
  `

  try {
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(resultados)
  } catch (erro) {
    console.error('Erro ao buscar lançamentos:', erro)
    res.status(500).json({ erro: 'Erro ao buscar lançamentos' })
  }
})

app.post('/lancamentos', exigirLogin, async (req, res) => {
  const { tipo, valor, categoriaId, descricao, forma, data, mesAno, bancoId } =
    req.body

  const sqlCategoria = `
    SELECT nome FROM categorias_gasto WHERE id = ? AND usuario_id = ?
  `

  let categorias
  try {
    categorias = (
      await pool.query(sqlCategoria, [
        categoriaId,
        req.usuarioId,
      ])
    )[0]
  } catch (erro) {
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

  try {
    const [resultado] = await pool.query(sql, valores)
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
  } catch (erro) {
    console.log('erro no lançamento', erro)
    return res.status(500).json({ erro: 'erro ao inserir lançamento' })
  }
})

app.delete('/lancamentos/:id', exigirLogin, async (req, res) => {
  const id = req.params.id

  const sql = `DELETE FROM lancamentos WHERE id = ? AND usuarioId = ?`

  try {
    const [resultado] = await pool.query(sql, [id, req.usuarioId])
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Lançamento não encontrado.' })
    }

    res.json({ mensagem: 'Excluido com sucesso', id: id })
  } catch (erro) {
    console.log('Erro ao excluir: ', erro)
    res.status(500).json({ erro: 'Erro ao exlcuir' })
  }
})

app.use((err, req, res, next) => {
  if (err.message === 'Não permitido por CORS') {
    return res.status(403).json({
      erro: 'Acesso CORS não permitido',
      origin: req.get('origin'),
    })
  }

  res.status(500).json({
    erro: 'Erro interno do servidor',
  })
})

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

// Categorias de gasto //

app.get('/categorias', exigirLogin, async (req, res) => {
  const sql = `SELECT id, nome FROM categorias_gasto WHERE usuario_id = ? ORDER BY nome`

  try {
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(resultados)
  } catch (erro) {
    console.log('Erro ao buscar categorias:', erro)
    res.status(500).json({ erro: 'Erro ao buscar categorias.' })
  }
})

app.post('/categorias', exigirLogin, async (req, res) => {
  const nome =
    typeof req.body.nome === 'string' ? req.body.nome.trim().toLowerCase() : ''

  if (!nome || nome.length > 100) {
    return res.status(400).json({ erro: 'Nome inválido.' })
  }

  const sql = `INSERT INTO categorias_gasto (usuario_id, nome) VALUES (?, ?)`

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId, nome])
    res.status(201).json({
      mensagem: 'Categoria criada',
      categoria: { id: resultado.insertId, nome },
    })
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      return res
        .status(409)
        .json({ erro: 'Você já tem uma categoria com esse nome.' })
    }
    console.log('Erro ao criar categoria:', erro)
    res.status(500).json({ erro: 'Erro ao criar categoria.' })
  }
})

app.delete('/categorias/:id', exigirLogin, async (req, res) => {
  const id = req.params.id

  const sqlFallback = `SELECT id FROM categorias_gasto WHERE usuario_id = ? AND nome = 'outros'`

  try {
    const [fallback] = await pool.query(sqlFallback, [req.usuarioId])
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

    await pool.query(sqlReatribuir, [idFallback, id, req.usuarioId])

    const sqlDeletarMetas = `DELETE FROM metas WHERE categoria_id = ? AND usuario_id = ?`
    await pool.query(sqlDeletarMetas, [id, req.usuarioId])

    const sqlDeletar = `DELETE FROM categorias_gasto WHERE id = ? AND usuario_id = ?`
    const [resultado] = await pool.query(sqlDeletar, [id, req.usuarioId])

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada.' })
    }

    res.json({ mensagem: 'Categoria excluída', id })
  } catch (erro) {
    console.log('Erro ao excluir categoria:', erro)
    res.status(500).json({ erro: 'Erro ao excluir categoria.' })
  }
})

// Metas //

app.get('/metas', exigirLogin, async (req, res) => {
  const sql = `
    SELECT m.id, m.categoria_id, c.nome AS categoria, m.valor_max, m.mes_ano
    FROM metas m
    JOIN categorias_gasto c ON c.id = m.categoria_id
    WHERE m.usuario_id = ?
  `

  try {
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(resultados)
  } catch (erro) {
    console.log('Erro ao buscar metas:', erro)
    res.status(500).json({ erro: 'Erro ao buscar metas.' })
  }
})

app.post('/metas', exigirLogin, async (req, res) => {
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

  try {
    const [resultado] = await pool.query(sql, [
      req.usuarioId,
      categoriaId,
      valorMax,
      mesAno,
    ])

    res.status(201).json({
      mensagem: 'Meta criada',
      meta: { id: resultado.insertId, categoriaId, valorMax, mesAno },
    })
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        erro: 'Você já tem uma meta para essa categoria neste mês.',
      })
    }
    if (erro.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ erro: 'Categoria inválida.' })
    }
    console.log('Erro ao criar meta:', erro)
    res.status(500).json({ erro: 'Erro ao criar meta.' })
  }
})

app.delete('/metas/:id', exigirLogin, async (req, res) => {
  const sql = `DELETE FROM metas WHERE id = ? AND usuario_id = ?`

  try {
    const [resultado] = await pool.query(sql, [req.params.id, req.usuarioId])
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Meta não encontrada.' })
    }

    res.json({ mensagem: 'Meta excluída', id: req.params.id })
  } catch (erro) {
    console.log('Erro ao excluir meta:', erro)
    res.status(500).json({ erro: 'Erro ao excluir meta.' })
  }
})

// Bancos //

app.get('/bancos', exigirLogin, async (req, res) => {
  const sql = `
    SELECT * FROM bancos
    WHERE usuarioId = ?
  `

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId])
    res.json(resultado)
  } catch (erro) {
    console.log('Erro ao buscar bancos: ', erro)
    res.status(500).json({ erro: 'Erro ao buscar bancos.' })
  }
})

app.post('/bancos', exigirLogin, async (req, res) => {
  const { nome, saldoInicial, mesCriado } = req.body

  const sql = `
    INSERT INTO bancos
    (nome, saldoInicial, mesCriado, usuarioId)
    VALUES (?, ?, ?, ?)
  `

  const valores = [nome, saldoInicial, mesCriado, req.usuarioId]

  try {
    const [resultado] = await pool.query(sql, valores)
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
  } catch (erro) {
    console.log('Erro ao criar banco:', erro)
    res.status(500).json({ erro: 'Erro ao criar banco.' })
  }
})

app.delete('/bancos/:id', exigirLogin, async (req, res) => {
  const id = req.params.id

  const sqlLancamentos = `
    DELETE FROM lancamentos
    WHERE bancoId = ? AND usuarioId = ?
  `

  try {
    await pool.query(sqlLancamentos, [id, req.usuarioId])
  } catch (erro) {
    console.log('Erro ao excluir lançamentos do banco:', erro)
    return res.status(500).json({
      erro: 'Erro ao excluir lançamentos do banco',
    })
  }

  const sqlBanco = `
      DELETE FROM bancos
      WHERE id = ? AND usuarioId = ?
    `

  try {
    await pool.query(sqlBanco, [id, req.usuarioId])
    res.json({
      mensagem: 'Banco excluído com sucesso',
      id: id,
    })
  } catch (erro) {
    console.log('Erro ao excluir banco:', erro)
    res.status(500).json({ erro: 'Erro ao excluir banco' })
  }
})

app.get('/reservas', exigirLogin, async (req, res) => {
  const sql = `
    SELECT * FROM reservas
    WHERE usuarioId = ?
  `

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId])
    res.json(resultado)
  } catch (erro) {
    console.log('Erro ao buscar reservas', erro)
    res.status(500).json({ erro: 'Erro ao buscar reservas' })
  }
})

// Criar coisa pra aumentar e diminuir valor da reserva

app.post('/reservas', exigirLogin, async (req, res) => {
  const { nome, valor } = req.body

  const sql = `
    INSERT INTO reservas
    (nome, valor, usuarioId)
    VALUES (?, ?, ?)
  `

  const valores = [nome, valor, req.usuarioId]

  try {
    const [resultado] = await pool.query(sql, valores)
    const novaReserva = {
      id: resultado.insertId,
      nome,
      valor,
    }

    res.status(201).json({
      mensagem: 'Reserva criada',
      reserva: novaReserva,
    })
  } catch (erro) {
    console.log('erro na reserva', erro)
    res.status(500).json({ erro: 'erro ao inserir reserva' })
  }
})

app.delete('/reservas/:id', exigirLogin, async (req, res) => {
  const id = req.params.id

  const sql = `
    DELETE FROM reservas
    WHERE id = ? AND usuarioId = ?
  `

  try {
    const [resultado] = await pool.query(sql, [id, req.usuarioId])
    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        erro: 'Reserva não encontrada.',
      })
    }

    res.json({
      mensagem: 'Reserva excluída com sucesso',
      id: id,
    })
  } catch (erro) {
    console.log('Erro ao excluir reserva:', erro)
    res.status(500).json({ erro: 'Erro ao excluir reserva' })
  }
})

app.patch('/reservas/:id', exigirLogin, async (req, res) => {
  const id = Number(req.params.id)
  const { tipo, valor } = req.body
  const valorNum = Number(valor)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID inválido.' })
  }

  if (!['adicionar', 'retirar'].includes(tipo)) {
    return res.status(400).json({ erro: 'Tipo inválido.' })
  }

  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    return res.status(400).json({ erro: 'Valor inválido.' })
  }

  const sql =
    tipo === 'adicionar'
      ? `
        UPDATE reservas SET valor = valor + ?
        WHERE id = ? AND usuarioId = ?
      `
      : `
        UPDATE reservas SET valor = valor - ?
        WHERE id = ? AND usuarioId = ? AND valor >= ?
      `
  const valores =
    tipo === 'adicionar'
      ? [valorNum, id, req.usuarioId]
      : [valorNum, id, req.usuarioId, valorNum]

  try {
    const [resultado] = await pool.query(sql, valores)
    if (resultado.affectedRows === 0) {
      if (tipo === 'retirar') {
        return res
          .status(422)
          .json({ erro: 'Saldo insuficiente ou reserva não encontrada.' })
      }
      return res.status(404).json({ erro: 'Reserva não encontrada.' })
    }

    res.json({ mensagem: 'Reserva atualizada', id })
  } catch (erro) {
    console.log('Erro ao atualizar reserva:', erro)
    res.status(500).json({ erro: 'Erro ao atualizar reserva.' })
  }
})

//              CADASTRO

app.post('/cadastro', async (req, res) => {
  const { nome, email, senha, confirmarSenha, convite } = req.body

  const nomeLimpo = nome?.trim()
  const emailLimpo = email?.trim().toLowerCase()

  if (typeof senha !== 'string' || typeof confirmarSenha !== 'string') {
    return res.status(400).json({
      erro: 'Senha inválida.',
    })
  }

  if (senha.length < 12 || senha.length > 64) {
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

  let connection
  let transacaoIniciada = false
  let etapa = 'iniciar transação'

  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    transacaoIniciada = true

    etapa = 'verificar convite'
    const sqlConvite = `
      SELECT *
      FROM convites
      WHERE token_hash = ?
        AND usado = FALSE
        AND expira_em > NOW()
      LIMIT 1
      FOR UPDATE
    `
    const [convites] = await connection.query(sqlConvite, [tokenHash])

    if (convites.length === 0) {
      await connection.rollback()
      transacaoIniciada = false
      return res.status(403).json({
        erro: 'Convite inválido, expirado ou já utilizado.',
      })
    }

    const conviteValido = convites[0]
    if (
      conviteValido.email &&
      conviteValido.email.toLowerCase() !== emailLimpo
    ) {
      await connection.rollback()
      transacaoIniciada = false
      return res.status(403).json({
        erro: 'Este convite está vinculado a outro e-mail.',
      })
    }

    etapa = 'gerar hash da senha'
    const senhaHash = await bcrypt.hash(senha, 12)

    etapa = 'cadastrar usuário'
    const sqlUsuario = `
      INSERT INTO usuarios
        (nome, email, senha_hash)
      VALUES (?, ?, ?)
    `
    const [resultadoUsuario] = await connection.query(sqlUsuario, [
      nomeLimpo,
      emailLimpo,
      senhaHash,
    ])
    const usuarioId = resultadoUsuario.insertId

    etapa = 'utilizar convite'
    const sqlUsarConvite = `
      UPDATE convites
      SET usado = TRUE
      WHERE id = ?
        AND usado = FALSE
    `
    const [resultadoUpdate] = await connection.query(sqlUsarConvite, [
      conviteValido.id,
    ])
    if (resultadoUpdate.affectedRows === 0) {
      throw new Error('Convite não pôde ser marcado como utilizado.')
    }

    etapa = 'inserir categoria padrão'
    const sqlCategoria = `
      INSERT INTO categorias_gasto
        (usuario_id, nome)
      VALUES (?, ?)
    `
    const CATEGORIAS_PADRAO = [
      'alimentação',
      'lazer',
      'transporte',
      'moradia',
      'saúde',
      'contas',
      'outros',
    ]
    for (const categoria of CATEGORIAS_PADRAO) {
      await connection.query(sqlCategoria, [usuarioId, categoria])
    }

    etapa = 'finalizar transação'
    await connection.commit()
    transacaoIniciada = false

    const token = jwt.sign({ sub: usuarioId }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    })

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24,
    })

    return res.status(201).json({
      mensagem: 'Usuário criado com sucesso!',
      id: usuarioId,
    })
  } catch (erro) {
    if (transacaoIniciada) {
      try {
        await connection.rollback()
      } catch (erroRollback) {
        console.error('Erro ao reverter transação:', erroRollback)
      }
    }

    if (etapa === 'iniciar transação') {
      console.error('Erro ao iniciar transação:', erro)
      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }
    if (etapa === 'verificar convite') {
      console.error('Erro ao verificar convite:', erro)
      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }
    if (etapa === 'gerar hash da senha') {
      console.error('Erro ao gerar hash da senha:', erro)
      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }
    if (etapa === 'cadastrar usuário') {
      if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          erro: 'Este e-mail já está cadastrado.',
        })
      }
      console.error('Erro ao cadastrar usuário:', erro)
      return res.status(500).json({ erro: 'Erro ao cadastrar usuário.' })
    }
    if (etapa === 'utilizar convite') {
      console.error('Erro ao utilizar convite:', erro)
      return res.status(500).json({ erro: 'Erro ao finalizar o cadastro.' })
    }
    if (etapa === 'inserir categoria padrão') {
      console.error('Erro ao inserir categoria padrão:', erro)
      return res.status(500).json({ erro: 'Erro ao finalizar cadastro.' })
    }

    console.error('Erro ao finalizar transação:', erro)
    return res.status(500).json({ erro: 'Erro ao finalizar o cadastro.' })
  } finally {
    if (connection) {
      connection.release()
    }
  }
})

app.post('/login', loginLimiter, async (req, res) => {
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

  let resultados
  try {
    resultados = (await pool.query(sql, [emailN]))[0]
  } catch (erro) {
    console.error('Erro ao buscar usuário:', erro)
    return res.status(500).json({ erro: 'Erro interno do servidor' })
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

//convites

app.get('/convites/verificar', async (req, res) => {
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

  let resultados
  try {
    resultados = (await pool.query(sql, [tokenHash]))[0]
  } catch (erro) {
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

function exigirAdmin(req, res, next) {
  exigirLogin(req, res, async () => {
    if (!req.usuarioId) {
      return res.status(401).json({ erro: 'Não autenticado' })
    }

    const sql = `SELECT role FROM usuarios WHERE id = ?`

    let resultados
    try {
      resultados = (await pool.query(sql, [req.usuarioId]))[0]
    } catch (erro) {
      console.error('Erro ao verificar administrador:', erro)
      return res.status(500).json({ erro: 'Erro interno do servidor.' })
    }

    if (resultados.length === 0) {
      return res.status(401).json({ erro: 'Usuário não encontrado.' })
    }

    if (resultados[0].role !== 'admin') {
      return res
        .status(403)
        .json({ erro: 'Acesso permitido apenas para administradores.' })
    }

    next()
  })
}

app.get('/usuario-atual', exigirLogin, async (req, res) => {
  const sql = `
    SELECT id, nome, email, role
    FROM usuarios
    WHERE id = ?
    LIMIT 1
  `

  let resultados
  try {
    resultados = (await pool.query(sql, [req.usuarioId]))[0]
  } catch (erro) {
    console.error('Erro ao buscar usuário atual:', erro)
    return res.status(500).json({ erro: 'Erro interno do servidor.' })
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
    admin: resultados[0].role,
  })
})

app.post('/convites', exigirAdmin, async (req, res) => {
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

  let resultado
  try {
    resultado = (
      await pool.query(sql, [emailLimpo, tokenHash, expiraEm])
    )[0]
  } catch (erro) {
    console.error('Erro ao criar convite:', erro)
    return res.status(500).json({ erro: 'Erro ao gerar convite.' })
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

app.get('/convites', exigirAdmin, async (req, res) => {
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

  try {
    const [resultados] = await pool.query(sql)
    return res.json(resultados)
  } catch (erro) {
    console.error('Erro ao buscar convites:', erro)
    res.status(500).json({ erro: 'Erro ao buscar convites.' })
  }
})

//Gastos Fixos

app.get('/gastos-fixos', exigirLogin, async (req, res) => {
  const sql = `
    SELECT id, nome, valor, status
    FROM gastos_fixos
    WHERE usuario_id = ?
  `

  try {
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(resultados)
  } catch (erro) {
    console.log('Erro ao buscar gastos fixos:', erro)
    res.status(500).json({ erro: 'Erro ao buscar gastos fixos.' })
  }
})

app.post('/gastos-fixos', exigirLogin, async (req, res) => {
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

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId, nome, valor])
    res.status(201).json({
      mensagem: 'Gasto fixo criado',
      gastoFixo: {
        id: resultado.insertId,
        nome,
        valor,
        status: 'pendente',
      },
    })
  } catch (erro) {
    console.log('Erro ao criar gasto fixo:', erro)
    res.status(500).json({ erro: 'Erro ao criar gasto fixo.' })
  }
})

app.patch('/gastos-fixos/:id', exigirLogin, async (req, res) => {
  const { status } = req.body

  if (!['pendente', 'pago'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' })
  }

  const sql = `
    UPDATE gastos_fixos
    SET status = ?
    WHERE id = ? AND usuario_id = ?
  `

  try {
    const [resultado] = await pool.query(sql, [
      status,
      req.params.id,
      req.usuarioId,
    ])
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Gasto fixo não encontrado.' })
    }
    res.json({ mensagem: 'Status atualizado', status })
  } catch (erro) {
    console.log('Erro ao atualizar gasto fixo:', erro)
    res.status(500).json({ erro: 'Erro ao atualizar gasto fixo.' })
  }
})

app.delete('/gastos-fixos/:id', exigirLogin, async (req, res) => {
  const sql = `
    DELETE FROM gastos_fixos
    WHERE id = ? AND usuario_id = ?
  `

  try {
    const [resultado] = await pool.query(sql, [req.params.id, req.usuarioId])
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Gasto fixo não encontrado.' })
    }

    res.json({ mensagem: 'Gasto fixo excluído', id: req.params.id })
  } catch (erro) {
    console.log('Erro ao excluir gasto fixo:', erro)
    res.status(500).json({ erro: 'Erro ao excluir gasto fixo.' })
  }
})
