require('dotenv').config()

const express = require('express')
const path = require('path')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')
const cors = require('cors')
const PDFDocument = require('pdfkit')

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
const reservas = require('./routes/reservas')
const investimentos = require('./routes/investimentos')
const cartoes = require('./routes/cartoes')
const transferencias = require('./routes/transferencias')
const { dataDoLancamento, intervaloDeBusca } = require('./lib/mesLancamento')
const {
  CATEGORIA_TRANSFERENCIA,
  CATEGORIA_FALLBACK,
  CATEGORIAS_PADRAO,
  nomePadrao,
  ehTransferencia,
  garantirCategoria,
} = require('./lib/categorias')
const {
  TIPOS,
  FORMAS,
  garantirEsquemaLancamentos,
  lerId,
  lerValor,
  lerData,
  lerDescricao,
  emTransacao,
  inserirLancamento,
} = require('./lib/lancamentos')

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
app.use('/reservas', reservas)
app.use('/investimentos', investimentos)
app.use('/cartoes', cartoes)
app.use('/transferencias', transferencias)

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
           l.categoria_id, l.cartaoId, l.grupoId, c.nome AS categoria
    FROM lancamentos l
    JOIN categorias_gasto c ON c.id = l.categoria_id
    WHERE l.usuarioId = ?
  `

  try {
    await garantirEsquemaLancamentos()
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(
      resultados.map((lancamento) => ({
        ...lancamento,
        ehTransferencia: ehTransferencia(lancamento.categoria),
      })),
    )
  } catch (erro) {
    console.error('Erro ao buscar lançamentos:', erro)
    res.status(500).json({ erro: 'Erro ao buscar lançamentos' })
  }
})

app.get('/lancamentos/relatorio-despesas', exigirLogin, async (req, res) => {
  const mesAno = req.query.mesAno

  if (!mesAno || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mesAno)) {
    return res.status(400).json({
      erro: 'Mês de referência inválido.',
    })
  }

  const sql = `
    SELECT l.id, l.valor, l.descricao, l.forma, l.data, l.grupoId,
          l.tipo, l.bancoId, b.nome AS banco, c.nome AS categoria
    FROM lancamentos l
    LEFT JOIN bancos b
      ON b.id = l.bancoId AND b.usuarioId = l.usuarioId
    LEFT JOIN categorias_gasto c ON c.id = l.categoria_id
    WHERE l.usuarioId = ? AND l.tipo IN ('despesa', 'ganho')
      AND l.data >= ? AND l.data < ?
    ORDER BY COALESCE(b.nome, 'Conta não identificada'), l.data DESC, l.id DESC
  `

  try {
    await garantirEsquemaLancamentos()
    const [candidatos] = await pool.query(sql, [
      req.usuarioId,
      ...intervaloDeBusca(mesAno),
    ])
    const lancamentos = candidatos.filter((lancamento) =>
      dataDoLancamento(lancamento.data)?.startsWith(mesAno),
    )
    const gruposPorBanco = new Map()

    lancamentos.forEach((lancamento) => {
      const idBanco = String(lancamento.bancoId ?? 'sem-conta')

      if (!gruposPorBanco.has(idBanco)) {
        gruposPorBanco.set(idBanco, {
          nome: lancamento.banco || 'Conta não identificada',
          despesas: [],
          ganhos: [],
          transferencias: [],
          totalDespesas: 0,
          totalGanhos: 0,
          totalRecebido: 0,
          totalEnviado: 0,
        })
      }

      const grupo = gruposPorBanco.get(idBanco)
      const valor = Number(lancamento.valor) || 0

      // Transferências aparecem no relatório, mas não são gasto nem ganho.
      if (ehTransferencia(lancamento.categoria)) {
        grupo.transferencias.push(lancamento)
        if (lancamento.tipo === 'ganho') grupo.totalRecebido += valor
        else grupo.totalEnviado += valor
      } else if (lancamento.tipo === 'despesa') {
        grupo.despesas.push(lancamento)
        grupo.totalDespesas += valor
      } else if (lancamento.tipo === 'ganho') {
        grupo.ganhos.push(lancamento)
        grupo.totalGanhos += valor
      }
    })

    const grupos = Array.from(gruposPorBanco.values())

    const totalDespesas = grupos.reduce(
      (total, grupo) => total + grupo.totalDespesas,
      0,
    )

    const totalGanhos = grupos.reduce(
      (total, grupo) => total + grupo.totalGanhos,
      0,
    )

    const saldoLiquido = totalGanhos - totalDespesas

    const totalRecebido = grupos.reduce(
      (total, grupo) => total + grupo.totalRecebido,
      0,
    )

    const totalEnviado = grupos.reduce(
      (total, grupo) => total + grupo.totalEnviado,
      0,
    )

    // "Para Cresol" / "De C6 Bank" quando a outra conta da transferência existe.
    const descreverMovimento = (lancamento) => {
      const outraPonta = lancamentos.find(
        (outro) =>
          lancamento.grupoId &&
          outro.grupoId === lancamento.grupoId &&
          outro.tipo !== lancamento.tipo,
      )
      if (lancamento.tipo === 'ganho') {
        return outraPonta?.banco ? `De ${outraPonta.banco}` : 'Recebida'
      }
      return outraPonta?.banco ? `Para ${outraPonta.banco}` : 'Enviada'
    }

    const quantidadeTotal = lancamentos.length
    const moeda = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
    const dataFormatada = (valor) => {
      const data = dataDoLancamento(valor)
      return data ? data.split('-').reverse().join('/') : 'Data indisponível'
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="relatorio-de-despesas.pdf"',
    )
    res.setHeader('Cache-Control', 'no-store')

    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      bufferPages: true,
    })
    pdf.on('error', (erro) => {
      console.error('Erro ao gerar PDF de despesas:', erro)
      if (res.headersSent) {
        res.destroy(erro)
      } else {
        res.status(500).json({ erro: 'Erro ao gerar o relatório de despesas.' })
      }
    })
    pdf.pipe(res)

    const margem = 42
    const largura = pdf.page.width - margem * 2
    const limiteInferior = pdf.page.height - 56
    const colunas = [
      { titulo: 'Data', largura: 58 },
      { titulo: 'Descrição', largura: 168 },
      { titulo: 'Categoria', largura: 112 },
      { titulo: 'Forma', largura: 90 },
      { titulo: 'Valor', largura: largura - 428, alinhar: 'right' },
    ]
    let y = 0

    function desenharCabecalhoPagina() {
      pdf.rect(0, 0, pdf.page.width, 8).fill('#244a78')
      pdf
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#55708f')
        .text('BOLSO  /  RELATÓRIO FINANCEIRO', margem, 30)
      pdf
        .font('Helvetica-Bold')
        .fontSize(21)
        .fillColor('#172b45')
        .text('Relatório financeiro por conta', margem, 49)
      pdf
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#66758a')
        .text(
          `Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}  |  Mês de referência: ${mesAno}`,
          margem,
          81,
        )
      pdf
        .moveTo(margem, 103)
        .lineTo(pdf.page.width - margem, 103)
        .lineWidth(1)
        .strokeColor('#dce3eb')
        .stroke()
    }

    function desenharCabecalhoTabela() {
      pdf.roundedRect(margem, y, largura, 24, 4).fill('#edf2f7')
      let x = margem + 8
      pdf.font('Helvetica-Bold').fontSize(7).fillColor('#52637a')
      colunas.forEach((coluna) => {
        pdf.text(coluna.titulo.toUpperCase(), x, y + 8, {
          width: coluna.largura - 12,
          align: coluna.alinhar || 'left',
          lineBreak: false,
        })
        x += coluna.largura
      })
      y += 30
    }

    function iniciarPagina(nomeBanco) {
      pdf.addPage()
      desenharCabecalhoPagina()
      y = 118
      if (nomeBanco) {
        pdf
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#244a78')
          .text(`${nomeBanco} - continuação`, margem, y)
        y += 20
        desenharCabecalhoTabela()
      }
    }

    function garantirEspaco(altura, nomeBanco) {
      if (y + altura > limiteInferior) {
        iniciarPagina(nomeBanco)
      }
    }

    function ajustarTexto(texto, larguraMaxima, tamanhoFonte) {
      let resultado = String(texto || '—')
        .replace(/\s+/g, ' ')
        .trim()
      pdf.font('Helvetica').fontSize(tamanhoFonte)
      while (
        resultado.length > 1 &&
        pdf.widthOfString(resultado) > larguraMaxima
      ) {
        resultado = `${resultado.slice(0, -2)}...`
      }
      return resultado
    }

    desenharCabecalhoPagina()
    y = 119

    pdf.roundedRect(margem, y, largura, 58, 7).fill('#f5f8fc')

    const espacamentoResumo = largura / 3

    // Total de despesas
    pdf
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#65758a')
      .text('TOTAL DE DESPESAS', margem + 12, y + 11)

    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#c0392b')
      .text(moeda.format(totalDespesas), margem + 12, y + 29)

    // Total de ganhos
    pdf
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#65758a')
      .text('TOTAL DE GANHOS', margem + espacamentoResumo, y + 11)

    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#21865a')
      .text(moeda.format(totalGanhos), margem + espacamentoResumo, y + 29)

    // Saldo líquido
    pdf
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#65758a')
      .text('SALDO LÍQUIDO', margem + espacamentoResumo * 2, y + 11)

    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(saldoLiquido >= 0 ? '#21865a' : '#c0392b')
      .text(moeda.format(saldoLiquido), margem + espacamentoResumo * 2, y + 29)

    y += 70

    pdf
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#65758a')
      .text(
        `${quantidadeTotal} lançamentos | ${grupos.length} contas`,
        margem,
        y - 5,
      )

    y += 5

    if (totalRecebido > 0 || totalEnviado > 0) {
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#244a78')
        .text(
          `Transferências: ${moeda.format(totalRecebido)} recebidos e ${moeda.format(totalEnviado)} enviados (não contam como ganho nem despesa).`,
          margem,
          y,
        )
      y += 18
    }

    if (grupos.length === 0) {
      pdf
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#65758a')
        .text('Nenhum lançamento financeiro cadastrado.', margem, y + 12, {
          width: largura,
          align: 'center',
        })
    }

    grupos.forEach((grupo) => {
      const secoes = [
        {
          titulo: 'DESPESAS',
          cor: '#c0392b',
          lancamentos: grupo.despesas,
          subtotal: moeda.format(grupo.totalDespesas),
        },
        {
          titulo: 'GANHOS',
          cor: '#21865a',
          lancamentos: grupo.ganhos,
          subtotal: moeda.format(grupo.totalGanhos),
        },
        {
          titulo: 'TRANSFERÊNCIAS',
          cor: '#244a78',
          transferencia: true,
          lancamentos: grupo.transferencias,
          subtotal: `+ ${moeda.format(grupo.totalRecebido)}   - ${moeda.format(grupo.totalEnviado)}`,
        },
      ]

      // Título da seção, cabeçalho da tabela e primeira linha ficam juntos.
      const alturaDeAbertura = (secao) =>
        49 + (secao.lancamentos.length === 1 ? 67 : 36)

      garantirEspaco(
        20 + alturaDeAbertura(secoes.find((secao) => secao.lancamentos.length)),
      )

      pdf
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#172b45')
        .text(grupo.nome, margem, y)

      y += 20

      secoes.forEach((secao) => {
        if (secao.lancamentos.length === 0) return

        if (y + alturaDeAbertura(secao) > limiteInferior) {
          iniciarPagina()
          pdf
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#244a78')
            .text(`${grupo.nome} - continuação`, margem, y)
          y += 20
        }

        pdf
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(secao.cor)
          .text(secao.titulo, margem, y)

        pdf
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#65758a')
          .text(`${secao.lancamentos.length} lançamentos`, margem + 100, y + 1)

        y += 19

        // Vale também para o cabeçalho repetido nas páginas de continuação.
        colunas[2].titulo = secao.transferencia ? 'Movimento' : 'Categoria'
        desenharCabecalhoTabela()

        secao.lancamentos.forEach((lancamento, indice) => {
          // A última linha reserva espaço para o subtotal, que não fica sozinho.
          const ultima = indice === secao.lancamentos.length - 1
          garantirEspaco(ultima ? 67 : 36, grupo.nome)

          const alturaLinha = 30

          if (indice % 2 === 0) {
            pdf.rect(margem, y - 3, largura, alturaLinha).fill('#fafbfd')
          }

          const valores = [
            dataFormatada(lancamento.data),
            ajustarTexto(
              lancamento.descricao || 'Sem descrição',
              colunas[1].largura - 12,
              8,
            ),
            ajustarTexto(
              secao.transferencia
                ? descreverMovimento(lancamento)
                : lancamento.categoria || 'Sem categoria',
              colunas[2].largura - 12,
              8,
            ),
            ajustarTexto(
              lancamento.forma || 'Não informada',
              colunas[3].largura - 12,
              8,
            ),
            `${secao.transferencia ? (lancamento.tipo === 'ganho' ? '+ ' : '- ') : ''}${moeda.format(Number(lancamento.valor) || 0)}`,
          ]

          let x = margem + 8

          pdf.font('Helvetica').fontSize(8).fillColor('#33445b')

          valores.forEach((valor, colunaIndice) => {
            const coluna = colunas[colunaIndice]

            pdf.text(valor, x, y + 6, {
              width: coluna.largura - 12,
              align: coluna.alinhar || 'left',
              lineBreak: false,
            })

            x += coluna.largura
          })

          y += alturaLinha
        })

        garantirEspaco(31, grupo.nome)

        pdf
          .moveTo(margem, y)
          .lineTo(pdf.page.width - margem, y)
          .lineWidth(0.7)
          .strokeColor('#dce3eb')
          .stroke()

        pdf
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(secao.cor)
          .text(`Subtotal - ${secao.titulo.toLowerCase()}`, margem + 8, y + 8)

        pdf
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(secao.subtotal, margem, y + 7, {
            width: largura - 8,
            align: 'right',
          })

        y += 31
      })
    })

    if (grupos.length > 0) {
      garantirEspaco(48)

      pdf.roundedRect(margem, y, largura, 38, 6).fill('#244a78')

      pdf
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#ffffff')
        .text('SALDO LÍQUIDO FINAL', margem + 12, y + 13)

      pdf
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(moeda.format(saldoLiquido), margem, y + 12, {
          width: largura - 12,
          align: 'right',
        })
    }

    const paginas = pdf.bufferedPageRange()
    for (
      let indice = paginas.start;
      indice < paginas.start + paginas.count;
      indice += 1
    ) {
      pdf.switchToPage(indice)
      pdf
        .moveTo(margem, pdf.page.height - 39)
        .lineTo(pdf.page.width - margem, pdf.page.height - 39)
        .lineWidth(0.7)
        .strokeColor('#dce3eb')
        .stroke()
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#7a8798')
        .text('Relatório financeiro privado', margem, pdf.page.height - 29)
      pdf.text(
        `Página ${indice + 1} de ${paginas.count}`,
        margem,
        pdf.page.height - 29,
        {
          width: largura,
          align: 'right',
        },
      )
    }

    pdf.end()
  } catch (erro) {
    console.error('Erro ao gerar relatório de despesas:', erro)
    if (res.headersSent) {
      res.destroy(erro)
      return
    }

    res.status(500).json({ erro: 'Erro ao gerar o relatório de despesas.' })
  }
})

app.post('/lancamentos', exigirLogin, async (req, res) => {
  const corpo = req.body || {}
  const { tipo, forma } = corpo
  const valor = lerValor(corpo.valor)
  const data = lerData(corpo.data)
  const descricao = lerDescricao(corpo.descricao)
  const categoriaId = lerId(corpo.categoriaId)
  const informado = (campo) =>
    corpo[campo] !== undefined && corpo[campo] !== null && corpo[campo] !== ''
  let bancoId = lerId(corpo.bancoId)
  let cartaoId = null
  let valorRepasse = null

  if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' })
  if (valor === null) return res.status(400).json({ erro: 'Informe um valor maior que zero.' })
  if (data === null) return res.status(400).json({ erro: 'Data inválida.' })
  if (!FORMAS.includes(forma)) return res.status(400).json({ erro: 'Forma de pagamento inválida.' })
  if (descricao === null) return res.status(400).json({ erro: 'Descrição muito longa.' })
  if (!categoriaId) return res.status(400).json({ erro: 'Categoria inválida.' })

  // Parte de um gasto que é de outra pessoa: vira um repasse à parte.
  if (informado('valorRepasse')) {
    valorRepasse = lerValor(corpo.valorRepasse)
    if (tipo !== 'despesa') {
      return res.status(400).json({ erro: 'Só um gasto pode ser dividido com outra pessoa.' })
    }
    if (valorRepasse === null || valorRepasse >= valor) {
      return res.status(400).json({
        erro: 'A parte da outra pessoa precisa ser menor que o total. Se o valor todo for dela, use a categoria Transferência.',
      })
    }
  }

  if (informado('cartaoId')) {
    cartaoId = lerId(corpo.cartaoId)
    if (!cartaoId) return res.status(400).json({ erro: 'Cartão inválido.' })
    if (tipo !== 'despesa' || !['credito', 'debito'].includes(forma)) {
      return res.status(400).json({ erro: 'Cartão só vale para gastos no crédito ou débito.' })
    }
  }

  try {
    await garantirEsquemaLancamentos()

    if (cartaoId) {
      const [cartoesEncontrados] = await pool.query(
        'SELECT bancoId FROM cartoes WHERE id = ? AND usuarioId = ?',
        [cartaoId, req.usuarioId],
      )
      if (cartoesEncontrados.length === 0) {
        return res.status(400).json({ erro: 'Cartão não encontrado.' })
      }
      // A compra fica na conta que paga o cartão (no crédito, ela só sai da conta quando a fatura é paga).
      bancoId = cartoesEncontrados[0].bancoId
    }

    const [contas] = await pool.query(
      'SELECT id FROM bancos WHERE id = ? AND usuarioId = ?',
      [bancoId, req.usuarioId],
    )
    if (contas.length === 0) return res.status(400).json({ erro: 'Conta não encontrada.' })

    const [categorias] = await pool.query(
      'SELECT id, nome FROM categorias_gasto WHERE id = ? AND usuario_id = ?',
      [categoriaId, req.usuarioId],
    )
    if (categorias.length === 0) return res.status(400).json({ erro: 'Categoria inválida.' })

    const categoria = categorias[0]
    const comum = { tipo, forma, data, bancoId, cartaoId }
    let partes = [{ ...comum, valor, categoria, descricao }]

    if (valorRepasse !== null) {
      if (ehTransferencia(categoria.nome)) {
        return res.status(400).json({ erro: 'Escolha a categoria da sua parte do gasto.' })
      }

      const categoriaRepasse = await garantirCategoria(pool, req.usuarioId, CATEGORIA_TRANSFERENCIA)
      const grupoId = crypto.randomUUID()
      const sufixo = ' (parte de outra pessoa)'
      partes = [
        {
          ...comum,
          grupoId,
          categoria,
          descricao,
          valor: Math.round((valor - valorRepasse) * 100) / 100,
        },
        {
          ...comum,
          grupoId,
          categoria: categoriaRepasse,
          descricao: `${(descricao || 'Repasse').slice(0, 255 - sufixo.length)}${sufixo}`,
          valor: valorRepasse,
        },
      ]
    }

    const lancamentos = await emTransacao(async (conexao) => {
      const criados = []
      for (const parte of partes) {
        criados.push(await inserirLancamento(conexao, req.usuarioId, parte))
      }
      return criados
    })

    res.status(201).json({
      mensagem: 'Lançamento criado',
      lancamento: lancamentos[0],
      lancamentos,
    })
  } catch (erro) {
    console.log('erro no lançamento', erro)
    return res.status(500).json({ erro: 'erro ao inserir lançamento' })
  }
})

// Lançamentos criados juntos (transferência ou gasto dividido) são excluídos
// juntos, para o saldo das contas não ficar pela metade.
app.delete('/lancamentos/:id', exigirLogin, async (req, res) => {
  const id = lerId(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  try {
    await garantirEsquemaLancamentos()

    const ids = await emTransacao(async (conexao) => {
      const [encontrados] = await conexao.query(
        'SELECT id, grupoId FROM lancamentos WHERE id = ? AND usuarioId = ? FOR UPDATE',
        [id, req.usuarioId],
      )
      if (encontrados.length === 0) return []

      let excluir = [encontrados[0].id]
      if (encontrados[0].grupoId) {
        const [grupo] = await conexao.query(
          'SELECT id FROM lancamentos WHERE grupoId = ? AND usuarioId = ? FOR UPDATE',
          [encontrados[0].grupoId, req.usuarioId],
        )
        excluir = grupo.map((lancamento) => lancamento.id)
      }

      await conexao.query('DELETE FROM lancamentos WHERE id IN (?) AND usuarioId = ?', [
        excluir,
        req.usuarioId,
      ])
      return excluir
    })

    if (ids.length === 0) {
      return res.status(404).json({ erro: 'Lançamento não encontrado.' })
    }

    res.json({ mensagem: 'Excluido com sucesso', id, ids })
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
    // Contas criadas antes das transferências ganham a categoria aqui.
    await garantirCategoria(pool, req.usuarioId, CATEGORIA_TRANSFERENCIA)
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(
      resultados.map((categoria) => ({
        ...categoria,
        protegida: nomePadrao(categoria.nome) !== null,
        ehTransferencia: ehTransferencia(categoria.nome),
      })),
    )
  } catch (erro) {
    console.log('Erro ao buscar categorias:', erro)
    res.status(500).json({ erro: 'Erro ao buscar categorias.' })
  }
})

app.post('/categorias', exigirLogin, async (req, res) => {
  const informado =
    typeof req.body?.nome === 'string' ? req.body.nome.trim().toLowerCase() : ''

  if (!informado || informado.length > 100) {
    return res.status(400).json({ erro: 'Nome inválido.' })
  }

  // Variações de uma categoria padrão ("Transferencia", "SAUDE") usam o nome
  // oficial, então não dá para criar uma cópia dela.
  const oficial = nomePadrao(informado)
  const nome = oficial || informado

  const sql = `INSERT INTO categorias_gasto (usuario_id, nome) VALUES (?, ?)`

  try {
    const [resultado] = await pool.query(sql, [req.usuarioId, nome])
    res.status(201).json({
      mensagem: 'Categoria criada',
      categoria: {
        id: resultado.insertId,
        nome,
        protegida: oficial !== null,
        ehTransferencia: ehTransferencia(nome),
      },
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
  const id = lerId(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  try {
    const [categorias] = await pool.query(
      'SELECT id, nome FROM categorias_gasto WHERE id = ? AND usuario_id = ?',
      [id, req.usuarioId],
    )
    if (categorias.length === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada.' })
    }
    if (nomePadrao(categorias[0].nome)) {
      return res.status(400).json({
        erro: `"${categorias[0].nome}" é uma categoria padrão e não pode ser excluída.`,
      })
    }

    const fallback = await garantirCategoria(pool, req.usuarioId, CATEGORIA_FALLBACK)

    await emTransacao(async (conexao) => {
      await conexao.query(
        'UPDATE lancamentos SET categoria_id = ? WHERE categoria_id = ? AND usuarioId = ?',
        [fallback.id, id, req.usuarioId],
      )
      await conexao.query('DELETE FROM metas WHERE categoria_id = ? AND usuario_id = ?', [
        id,
        req.usuarioId,
      ])
      await conexao.query('DELETE FROM categorias_gasto WHERE id = ? AND usuario_id = ?', [
        id,
        req.usuarioId,
      ])
    })

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
    JOIN categorias_gasto c ON c.id = m.categoria_id AND c.usuario_id = m.usuario_id
    WHERE m.usuario_id = ?
  `

  try {
    const [resultados] = await pool.query(sql, [req.usuarioId])
    res.json(resultados.filter((meta) => !ehTransferencia(meta.categoria)))
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
    const [categorias] = await pool.query(
      'SELECT nome FROM categorias_gasto WHERE id = ? AND usuario_id = ?',
      [categoriaId, req.usuarioId],
    )
    if (categorias.length === 0) {
      return res.status(400).json({ erro: 'Categoria inválida.' })
    }
    if (ehTransferencia(categorias[0].nome)) {
      return res.status(400).json({
        erro: 'Transferências não contam como gasto, então não têm meta.',
      })
    }

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

function corValida(cor) {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor)
}

// Garante a coluna `cor` em bancos já existentes (o mesmo ALTER está em db/migracao_bancos_cor.sql).
let colunaCorBancosPronta = null

function garantirColunaCorBancos() {
  if (!colunaCorBancosPronta) {
    colunaCorBancosPronta = (async () => {
      const [colunas] = await pool.query(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bancos' AND COLUMN_NAME = 'cor'`,
      )
      if (Number(colunas[0].total) === 0) {
        await pool.query('ALTER TABLE bancos ADD COLUMN cor VARCHAR(7) DEFAULT NULL')
      }
    })().catch((erro) => {
      colunaCorBancosPronta = null
      throw erro
    })
  }
  return colunaCorBancosPronta
}

app.post('/bancos', exigirLogin, async (req, res) => {
  const { nome, saldoInicial, mesCriado } = req.body
  const cor = corValida(req.body.cor) ? req.body.cor.toLowerCase() : null

  const sql = `
    INSERT INTO bancos
    (nome, saldoInicial, mesCriado, usuarioId, cor)
    VALUES (?, ?, ?, ?, ?)
  `

  const valores = [nome, saldoInicial, mesCriado, req.usuarioId, cor]

  try {
    await garantirColunaCorBancos()
    const [resultado] = await pool.query(sql, valores)
    const novoBanco = {
      id: resultado.insertId,
      nome,
      saldoInicial,
      mesCriado,
      cor,
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

app.patch('/bancos/:id', exigirLogin, async (req, res) => {
  const id = Number(req.params.id)
  const { nome, saldoInicial, cor } = req.body
  const campos = []
  const valores = []

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID inválido.' })
  }

  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 100) {
      return res.status(400).json({ erro: 'Nome do banco inválido.' })
    }
    campos.push('nome = ?')
    valores.push(nome.trim())
  }

  if (saldoInicial !== undefined) {
    const saldo = Number(saldoInicial)
    if (!Number.isFinite(saldo) || Math.abs(saldo) > 99999999) {
      return res.status(400).json({ erro: 'Saldo inicial inválido.' })
    }
    campos.push('saldoInicial = ?')
    valores.push(Math.round(saldo * 100) / 100)
  }

  if (cor !== undefined) {
    if (cor !== null && !corValida(cor)) {
      return res.status(400).json({ erro: 'Cor inválida.' })
    }
    campos.push('cor = ?')
    valores.push(cor ? cor.toLowerCase() : null)
  }

  if (campos.length === 0) {
    return res.status(400).json({ erro: 'Nada para atualizar.' })
  }

  try {
    await garantirColunaCorBancos()
    const [resultado] = await pool.query(
      `UPDATE bancos SET ${campos.join(', ')} WHERE id = ? AND usuarioId = ?`,
      [...valores, id, req.usuarioId],
    )

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Banco não encontrado.' })
    }

    const [bancos] = await pool.query(
      'SELECT * FROM bancos WHERE id = ? AND usuarioId = ?',
      [id, req.usuarioId],
    )
    res.json({ mensagem: 'Banco atualizado', banco: bancos[0] })
  } catch (erro) {
    console.log('Erro ao atualizar banco:', erro)
    res.status(500).json({ erro: 'Erro ao atualizar banco.' })
  }
})

app.delete('/bancos/:id', exigirLogin, async (req, res) => {
  const id = lerId(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  try {
    await garantirEsquemaLancamentos()
    await emTransacao(async (conexao) => {
      // O dinheiro que foi para (ou veio de) outra conta continua lá: a ponta
      // que sobra deixa de estar ligada à conta excluída.
      await conexao.query(
        `UPDATE lancamentos restante
         JOIN lancamentos removido
           ON removido.grupoId = restante.grupoId AND removido.usuarioId = restante.usuarioId
         SET restante.grupoId = NULL
         WHERE removido.bancoId = ? AND removido.usuarioId = ? AND restante.bancoId <> ?`,
        [String(id), req.usuarioId, String(id)],
      )
      await conexao.query('DELETE FROM lancamentos WHERE bancoId = ? AND usuarioId = ?', [String(id), req.usuarioId])
      await conexao.query('DELETE FROM cartoes WHERE bancoId = ? AND usuarioId = ?', [id, req.usuarioId])
      await conexao.query('DELETE FROM fatura_pagamentos WHERE bancoId = ? AND usuarioId = ?', [id, req.usuarioId])
      await conexao.query('DELETE FROM bancos WHERE id = ? AND usuarioId = ?', [id, req.usuarioId])
    })
    res.json({
      mensagem: 'Banco excluído com sucesso',
      id: id,
    })
  } catch (erro) {
    console.log('Erro ao excluir banco:', erro)
    res.status(500).json({ erro: 'Erro ao excluir banco' })
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
    resultado = (await pool.query(sql, [emailLimpo, tokenHash, expiraEm]))[0]
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
