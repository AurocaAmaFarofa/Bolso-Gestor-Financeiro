// Decide o dia e o mês de um lançamento a partir da coluna `data` (timestamp
// em milissegundos), seguindo a mesma regra da tela (public/script.js).
// A coluna `mesAno` não é confiável: registros antigos gravaram nela o mês que
// estava aberto no painel, e não o mês da data do lançamento.

const UM_DIA = 24 * 60 * 60 * 1000

const formatadorSaoPaulo = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Retorna 'AAAA-MM-DD' ou null se o valor não for uma data.
function dataDoLancamento(valor) {
  const data = new Date(Number(valor))
  if (Number.isNaN(data.getTime())) return null

  // Meia-noite UTC exata representa uma data sem horário: converter o fuso
  // jogaria o lançamento para o dia anterior.
  if (data.getTime() % UM_DIA === 0) return data.toISOString().slice(0, 10)

  return formatadorSaoPaulo.format(data)
}

// Intervalo de timestamps para buscar no banco, com um dia de folga em cada
// ponta por causa do fuso. O corte exato é feito com dataDoLancamento.
function intervaloDeBusca(mesAno) {
  const [ano, mes] = mesAno.split('-').map(Number)

  return [Date.UTC(ano, mes - 1, 1) - UM_DIA, Date.UTC(ano, mes, 1) + UM_DIA]
}

module.exports = { dataDoLancamento, intervaloDeBusca }
