// Categorias padrão do Bolso. Esta é a única lista: o cadastro, o login Google
// e as rotas de categorias usam a mesma, para o back-end não ser contornado.
//
// Lançamentos na categoria "transferência" movimentam o saldo das contas, mas
// não contam como gasto nem como receita (nem em metas, gráficos ou totais).

const CATEGORIA_TRANSFERENCIA = 'transferência'
const CATEGORIA_FALLBACK = 'outros'

const CATEGORIAS_PADRAO = [
  'alimentação',
  'lazer',
  'transporte',
  'moradia',
  'saúde',
  'contas',
  CATEGORIA_FALLBACK,
  CATEGORIA_TRANSFERENCIA,
]

// Compara nomes ignorando acentos, maiúsculas, espaços, pontuação e caracteres
// invisíveis: "Transferencia " e "TRANSFERÊNCIA" são a mesma categoria.
function chaveCategoria(nome) {
  return String(nome ?? '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
}

// Devolve o nome oficial se o texto se referir a uma categoria padrão.
function nomePadrao(nome) {
  const chave = chaveCategoria(nome)
  return CATEGORIAS_PADRAO.find((padrao) => chaveCategoria(padrao) === chave) || null
}

function ehTransferencia(nome) {
  return nomePadrao(nome) === CATEGORIA_TRANSFERENCIA
}

// Busca uma categoria padrão do usuário, criando se ainda não existir
// (contas antigas não têm "transferência"). Use fora de transações.
async function garantirCategoria(conexao, usuarioId, nome) {
  const sql = 'SELECT id, nome FROM categorias_gasto WHERE usuario_id = ? AND nome = ?'
  const [existentes] = await conexao.query(sql, [usuarioId, nome])
  if (existentes.length) return existentes[0]

  await conexao.query(
    'INSERT IGNORE INTO categorias_gasto (usuario_id, nome) VALUES (?, ?)',
    [usuarioId, nome],
  )
  const [criadas] = await conexao.query(sql, [usuarioId, nome])
  return criadas[0]
}

module.exports = {
  CATEGORIA_TRANSFERENCIA,
  CATEGORIA_FALLBACK,
  CATEGORIAS_PADRAO,
  nomePadrao,
  ehTransferencia,
  garantirCategoria,
}
