// Validação e gravação de lançamentos, compartilhadas pelas rotas.

const pool = require('../db/connections')
const { ehTransferencia } = require('./categorias')
const { dataDoLancamento } = require('./mesLancamento')
const { garantirEsquemaCartoes } = require('./esquemaCartoes')

const TIPOS = ['despesa', 'ganho']
const FORMAS = ['pix', 'debito', 'credito', 'dinheiro', 'transferencia']

const MAIOR_VALOR_EM_CENTAVOS = 9999999999 // DECIMAL(10,2)
const MENOR_DATA = Date.UTC(2000, 0, 1)
const MAIOR_DATA = Date.UTC(2101, 0, 1)

// Garante a coluna `grupoId`, que liga lançamentos criados juntos (as duas
// pontas de uma transferência ou as duas partes de um gasto dividido).
let esquemaPronto = null

function garantirEsquemaLancamentos() {
  if (!esquemaPronto) {
    esquemaPronto = (async () => {
      await garantirEsquemaCartoes()
      const [colunas] = await pool.query(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lancamentos' AND COLUMN_NAME = 'grupoId'`,
      )
      if (Number(colunas[0].total) === 0) {
        await pool.query(
          `ALTER TABLE lancamentos
           ADD COLUMN grupoId CHAR(36) DEFAULT NULL,
           ADD KEY idx_lancamentos_grupo (grupoId)`,
        )
      }
    })().catch((erro) => {
      esquemaPronto = null
      throw erro
    })
  }
  return esquemaPronto
}

// As funções de leitura devolvem null quando o valor é inválido.

function lerId(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null
  if (!/^[1-9]\d{0,9}$/.test(String(valor))) return null
  return Number(valor)
}

function lerValor(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null
  const centavos = Math.round(Number(valor) * 100)
  if (!(centavos > 0 && centavos <= MAIOR_VALOR_EM_CENTAVOS)) return null
  return centavos / 100
}

// Timestamp em milissegundos.
function lerData(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null
  if (!/^\d+$/.test(String(valor))) return null
  const data = Number(valor)
  return data >= MENOR_DATA && data < MAIOR_DATA ? data : null
}

function lerDescricao(valor) {
  if (valor === undefined || valor === null) return ''
  if (typeof valor !== 'string' || valor.trim().length > 255) return null
  return valor.trim()
}

async function emTransacao(trabalho) {
  const conexao = await pool.getConnection()
  try {
    await conexao.beginTransaction()
    const resultado = await trabalho(conexao)
    await conexao.commit()
    return resultado
  } catch (erro) {
    await conexao.rollback()
    throw erro
  } finally {
    conexao.release()
  }
}

// Grava um lançamento já validado e devolve no mesmo formato do GET /lancamentos.
// O mês é sempre calculado pela data, nunca recebido do navegador.
async function inserirLancamento(conexao, usuarioId, dados) {
  const { tipo, valor, categoria, descricao, forma, data, bancoId } = dados
  const cartaoId = dados.cartaoId ?? null
  const grupoId = dados.grupoId ?? null
  const mesAno = dataDoLancamento(data).slice(0, 7)

  const [resultado] = await conexao.query(
    `INSERT INTO lancamentos
     (tipo, valor, categoria_id, descricao, forma, data, mesAno, bancoId, usuarioId, cartaoId, grupoId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tipo, valor, categoria.id, descricao, forma, data, mesAno, String(bancoId), usuarioId, cartaoId, grupoId],
  )

  return {
    id: resultado.insertId,
    tipo,
    valor,
    descricao,
    forma,
    data,
    mesAno,
    bancoId: String(bancoId),
    categoria_id: categoria.id,
    categoria: categoria.nome,
    cartaoId,
    grupoId,
    ehTransferencia: ehTransferencia(categoria.nome),
  }
}

module.exports = {
  TIPOS,
  FORMAS,
  garantirEsquemaLancamentos,
  lerId,
  lerValor,
  lerData,
  lerDescricao,
  emTransacao,
  inserirLancamento,
}
