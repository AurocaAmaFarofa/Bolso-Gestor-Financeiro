// Série diária do CDI (SGS 12 do Banco Central), com cache na tabela cdi_diario.
// A taxa vem em % ao dia, ex.: 0.050788 = 0,050788% no dia.

const pool = require('../db/connections')
const { hojeIso, somarDias } = require('./investimentoCalculo')

const URL_SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados'
const INTERVALO_ATUALIZACAO_MS = 3 * 60 * 60 * 1000
// A API do Banco Central limita consultas diárias a 10 anos por requisição.
const DIAS_POR_REQUISICAO = 365 * 5

let ultimaAtualizacao = 0
let atualizacaoEmAndamento = null

function isoParaBr(dataIso) {
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

function brParaIso(dataBr) {
  const [dia, mes, ano] = dataBr.split('/')
  return `${ano}-${mes}-${dia}`
}

async function buscarNoBancoCentral(inicioIso, fimIso) {
  const url = `${URL_SGS}?formato=json&dataInicial=${isoParaBr(inicioIso)}&dataFinal=${isoParaBr(fimIso)}`
  const resposta = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })

  // Sem dados no período a API responde 404; não é erro para nós.
  if (resposta.status === 404) return []

  if (!resposta.ok) {
    throw new Error(`Banco Central respondeu ${resposta.status}`)
  }

  const dados = await resposta.json()
  if (!Array.isArray(dados)) return []

  return dados
    .map((item) => ({ data: brParaIso(item.data), taxa: Number(item.valor) }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.data) && Number.isFinite(item.taxa))
}

async function salvar(registros) {
  if (registros.length === 0) return
  const valores = registros.map((item) => [item.data, item.taxa])
  await pool.query(
    'INSERT INTO cdi_diario (data, taxa) VALUES ? ON DUPLICATE KEY UPDATE taxa = VALUES(taxa)',
    [valores],
  )
}

async function baixarIntervalo(inicioIso, fimIso) {
  for (let inicio = inicioIso; inicio <= fimIso; inicio = somarDias(inicio, DIAS_POR_REQUISICAO + 1)) {
    const fimParcial = somarDias(inicio, DIAS_POR_REQUISICAO)
    const fim = fimParcial < fimIso ? fimParcial : fimIso
    await salvar(await buscarNoBancoCentral(inicio, fim))
  }
}

async function intervaloEmCache() {
  const [linhas] = await pool.query(
    `SELECT DATE_FORMAT(MIN(data), '%Y-%m-%d') AS minimo,
            DATE_FORMAT(MAX(data), '%Y-%m-%d') AS maximo
     FROM cdi_diario`,
  )
  return linhas[0] || { minimo: null, maximo: null }
}

// Garante que o cache cobre de `desdeIso` até hoje (o que o Banco Central já publicou).
async function atualizarCache(desdeIso) {
  const hoje = hojeIso()
  const { minimo, maximo } = await intervaloEmCache()

  if (!minimo || desdeIso < minimo) {
    await baixarIntervalo(desdeIso, minimo ? somarDias(minimo, -1) : hoje)
  }

  const deveAtualizarFim =
    maximo && maximo < somarDias(hoje, -1) && Date.now() - ultimaAtualizacao > INTERVALO_ATUALIZACAO_MS

  if (deveAtualizarFim) {
    await baixarIntervalo(somarDias(maximo, 1), hoje)
  }

  ultimaAtualizacao = Date.now()
}

/**
 * Retorna a série do CDI a partir de `desdeIso`.
 * Se o Banco Central estiver fora do ar, usa o que já estiver em cache.
 */
async function obterCdi(desdeIso) {
  let avisoAtualizacao = null

  try {
    if (!atualizacaoEmAndamento) {
      atualizacaoEmAndamento = atualizarCache(desdeIso).finally(() => {
        atualizacaoEmAndamento = null
      })
    }
    await atualizacaoEmAndamento
  } catch (erro) {
    console.log('Não foi possível atualizar o CDI:', erro.message)
    avisoAtualizacao = 'Não foi possível atualizar o CDI agora; usando os últimos dados salvos.'
  }

  // Busca alguns dias antes para cobrir aportes feitos em fim de semana.
  const [linhas] = await pool.query(
    `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS data, taxa
     FROM cdi_diario
     WHERE data >= ?
     ORDER BY data`,
    [somarDias(desdeIso, -7)],
  )

  const mapa = new Map(linhas.map((linha) => [linha.data, Number(linha.taxa)]))
  let ultimaData = linhas.length ? linhas[linhas.length - 1].data : null
  let ultimaTaxa = linhas.length ? Number(linhas[linhas.length - 1].taxa) : null

  if (!ultimaData) {
    const [ultima] = await pool.query(
      `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS data, taxa FROM cdi_diario ORDER BY data DESC LIMIT 1`,
    )
    if (ultima.length) {
      ultimaData = ultima[0].data
      ultimaTaxa = Number(ultima[0].taxa)
    }
  }

  return {
    mapa,
    ultimaData,
    ultimaTaxa,
    // CDI anualizado (252 dias úteis) a partir da última taxa diária.
    taxaAnual: ultimaTaxa === null ? null : ((1 + ultimaTaxa / 100) ** 252 - 1) * 100,
    aviso:
      ultimaData === null
        ? 'Ainda não foi possível obter o CDI do Banco Central; os rendimentos aparecerão quando houver conexão.'
        : avisoAtualizacao,
  }
}

module.exports = { obterCdi }
