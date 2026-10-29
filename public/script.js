const btnLancamentos = document.querySelector('#new-expense')
const btnFecharPopup = document.querySelector('#close-popup')
const lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
const pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
const reservas = JSON.parse(localStorage.getItem('reservas')) || []
const btnAddLancamento = document.querySelector('#btn-submit')
const btnGasto = document.querySelector('#expense-btn')
const btnRecebimento = document.querySelector('#income-btn')
const gridLancamentos = document.querySelector('#grid-expenses')
const gridGastosFixos = document.querySelector('#grid-fixed-expenses')
const gridReservas = document.querySelector('#grid-reserveds')
const cardLancamentos = document.querySelectorAll('.card-expenses')
const saldoAtual = document.querySelector('#current-balance-id')
const totalGasto = document.querySelector('#total-expenses')
const btnPendente = document.querySelector('#pending-btn')
const btnPopupGastoFixo = document.querySelector('#btn-new-pending')
const modalPopupFixed = document.querySelector('#popup-fixed-expense')
const modalPopupReserved = document.querySelector('#popup-reserved')
const btnFecharGastoFixo = document.querySelector('#close-popup-fixed')
const btnAddGastoFixo = document.querySelector('#btn-submit-fixed-expense')
const gastosFixosMain = document.querySelector('#fixed-expenses-main')
const btnFecharReservas = document.querySelector('#close-popup-reserved')
const btnPopupNovaReserva = document.querySelector('#btn-new-reserve')
const btnAddReserva = document.querySelector('#btn-submit-reserve')
const totalReservadoVisor = document.querySelector('#total-reserved')
const totalDinheiroVisor = document.querySelector('#total-money')
const popupAddReserva = document.querySelector('#modal-add')
const popupDimReserva = document.querySelector('#modal-minus')
const btnTirarValor = document.querySelector('#withdraw-value')
const btnAdicionarValorReserva = document.querySelector('#add-value')
const inputMaisReserva = document.querySelector('#plus-value-reserve')
const inputMenosReserva = document.querySelector('#minus-value-reserve')
const modalPopupBanco = document.querySelector('#popup-novo-banco')
const btnOpenPopupBanco = document.querySelector('#btn-open-popup-banco')
const btnClosePopupBanco = document.querySelector('#close-popup-banco')
const btnSubmitBanco = document.querySelector('#btn-submit-banco')
const listBancosAbas = document.querySelector('#list-bancos-abas')
const saldoBancoVisor = document.querySelector('#banco-id-visor')
const visorMes = document.querySelector('#month-visor')
const btnCriarMeta = document.querySelector('#btn-submit-goal')
const visorMainMeta = document.querySelector('#main-goals-visor')
const visorExMeta = document.querySelector('#expense-goals-visor')
const metaGeral = document.querySelectorAll('.progress-goal')
const btnCriarCategoriaGasto = document.querySelector(
  '#btn-submit-new-expense-category',
)
let valorTotalReservado = 0
let indiceReservaSelecionada = null //INDICE PRA MUDAR VALOR NA RESERVA
let tipoSelecionado = 'despesa' //TIPO DE LANÇAMENTO
let pagoOuNaoPago = 'naoPago' //MUDAR O ESTADO DO GASTO FIXO

const paginaAtual = window.location.pathname

// ================= APP DATA ==================

const dataAtual = new Date()
const anoMesAtual =
  dataAtual.getFullYear() + '-' + String(dataAtual.getMonth() + 1)

function showPopup(mensagem = 'Operação realizada.', duracao = 2500) {
  let container = document.getElementById('toast-container')

  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'toast-container'
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = mensagem

  container.appendChild(toast)

  requestAnimationFrame(() => {
    toast.classList.add('show')
  })

  window.clearTimeout(toast.hideTimer)
  toast.hideTimer = window.setTimeout(() => {
    toast.classList.add('hide')
    window.setTimeout(() => {
      toast.remove()
      if (!container.hasChildNodes()) {
        container.remove()
      }
    }, 220)
  }, duracao)
}

window.showPopup = showPopup

const mesEAno = String(anoMesAtual)
let [ano, mes] = mesEAno.split('-')
if (mes < 10) {
  mes = '0' + mes
}
ResultadoMes = `${ano}-` + `${mes}`

const appData = JSON.parse(localStorage.getItem('BolsoappData')) || {
  bancoAtual: null,
  bancos: [],
  lancamentos: [],
  reservas: [],
  pendencias: [],
  mesAtivo: ResultadoMes,
  metas: [],
  categoriasGasto: [
    { id: 'cat-1', nome: 'Alimentação' },
    { id: 'cat-2', nome: 'Lazer' },
    { id: 'cat-3', nome: 'Transporte' },
    { id: 'cat-4', nome: 'Moradia' },
    { id: 'cat-5', nome: 'Saúde' },
    { id: 'cat-6', nome: 'Contas' },
    { id: 'cat-7', nome: 'Outros' },
  ],
}

console.log(appData.mesAtivo)

function salvarDados() {
  localStorage.setItem('BolsoappData', JSON.stringify(appData))
}

console.log(appData)

// =========== add opções de tipo de gasto =============

function primeiraLetraMaior(texto) {
  if (!texto) {
    return
  }
  const textoMinusculo = texto.toLowerCase()
  return textoMinusculo.charAt(0).toUpperCase() + textoMinusculo.slice(1)
}

window.excluirCategoria = excluirCategoria

async function carregarCategorias() {
  try {
    const resposta = await fetch('/categorias')

    if (resposta.status === 401) {
      window.location.href = 'login.html'
      return
    }

    if (!resposta.ok) {
      console.error('Erro ao carregar categorias:', resposta.status)
      return
    }

    appData.categoriasGasto = await resposta.json()
    renderizarCategoriasDeGasto()
  } catch (erro) {
    console.error('Erro ao carregar categorias:', erro)
  }
}

async function adicionarNovaCategoria() {
  const inputNome = document.getElementById('new-category-name')

  if (!inputNome) {
    return
  }

  const nomeCategoria = inputNome.value.trim()

  if (nomeCategoria === '') return

  try {
    const resposta = await fetch('/categorias', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nome: nomeCategoria }),
    })

    const resultado = await resposta.json()

    if (!resposta.ok) {
      showPopup(resultado.erro || 'Erro ao criar categoria.', 2200)
      return
    }

    appData.categoriasGasto.push(resultado.categoria)
    renderizarCategoriasDeGasto()

    inputNome.value = ''
    abrirOuFecharPopup('popup-nova-categoria', 'fechar')
  } catch (erro) {
    console.error('Erro ao criar categoria:', erro)
  }
}

async function excluirCategoria(id) {
  const categoria = appData.categoriasGasto.find((c) => c.id === id)
  const nome = categoria ? primeiraLetraMaior(categoria.nome) : 'esta categoria'

  const confirmou = confirm(
    `Excluir "${nome}"? Os lançamentos dela serão movidos para "Outros" e as metas dela serão apagadas.`,
  )

  if (!confirmou) return

  try {
    const resposta = await fetch(`/categorias/${id}`, { method: 'DELETE' })
    const resultado = await resposta.json()

    if (!resposta.ok) {
      showPopup(resultado.erro || 'Erro ao excluir categoria.', 2200)
      return
    }

    appData.categoriasGasto = appData.categoriasGasto.filter((c) => c.id !== id)
    renderizarCategoriasDeGasto()
    await carregarLancamento()
    await carregarMetas()
  } catch (erro) {
    console.error('Erro ao excluir categoria:', erro)
  }
}

function renderizarCategoriasDeGasto() {
  const htmlCategoriaMeta = document.getElementById('category-select-goals')
  const htmlCategoria = document.getElementById('category-select')
  const listaCategorias = document.getElementById('lista-categorias')

  if (!htmlCategoriaMeta || !htmlCategoria) {
    return
  }

  htmlCategoriaMeta.innerHTML = ''
  htmlCategoria.innerHTML = ''
  if (listaCategorias) listaCategorias.innerHTML = ''

  appData.categoriasGasto.forEach((gasto) => {
    const nomeFormatado = escaparHtml(primeiraLetraMaior(gasto.nome))

    htmlCategoria.innerHTML += `
            <option value="${gasto.id}">${nomeFormatado}</option>
        `

    htmlCategoriaMeta.innerHTML += `
            <option value="${gasto.id}">${nomeFormatado}</option>
        `

    if (listaCategorias && gasto.nome !== 'outros') {
      listaCategorias.innerHTML += `
        <div class="item-categoria">
          <span>${nomeFormatado}</span>
          <button type="button" onclick="excluirCategoria(${gasto.id})">x</button>
        </div>
      `
    }
  })
}

// =============== Ultimos lançamentos ==========================

const btnUltimosGastos = document.querySelector('#btn-open-last')
const gridUltimosGastos = document.querySelector('#grid-last')
let status = 'fechado'

if (btnUltimosGastos) {
  btnUltimosGastos.addEventListener('click', () => {
    if (appData.lancamentos.length === 0) {
      gridUltimosGastos.innerHTML = '<span>Nenhum lançamento ainda</span>'
      return
    }
    atualizarGridUltimos()
  })
}

function atualizarGridUltimos() {
  if (!gridUltimosGastos) {
    return
  }

  if (appData.lancamentos.length === 0) {
    gridUltimosGastos.innerHTML = '<span>Nenhum lançamento ainda</span>'
    if (btnUltimosGastos) {
      btnUltimosGastos.disabled = true
      btnUltimosGastos.setAttribute('aria-expanded', 'false')
      btnUltimosGastos.setAttribute('aria-label', 'Sem lançamentos recentes')
    }
    return
  }

  if (status === 'fechado') {
    if (btnUltimosGastos) {
      btnUltimosGastos.disabled = false
      btnUltimosGastos.setAttribute('aria-expanded', 'true')
      btnUltimosGastos.setAttribute(
        'aria-label',
        'Recolher lançamentos recentes',
      )
    }
    const copiaLancamentos = appData.lancamentos.slice()
    const arrayLançamentos = copiaLancamentos.reverse()
    const primeirosLan = arrayLançamentos.slice(0, 3)
    gridUltimosGastos.innerHTML = ''
    primeirosLan.forEach((item) => {
      const valor = Number(item.valor)
      const data = new Date(item.data)
      const dataFormatada = Number.isNaN(data.getTime())
        ? ''
        : data.toLocaleDateString('pt-BR')
      const tipoFormatado = item.tipo === 'ganho' ? 'Receita' : 'Despesa'

      gridUltimosGastos.innerHTML += `
        <div class="card-expenses cards-last">
          <h3 class="card-text-last">${escaparHtml(item.descricao)}</h3>
          <strong class="card-text-last recent-amount ${item.tipo === 'ganho' ? 'recent-income' : 'recent-expense'}">${moedaBRL.format(valor)}</strong>
          <p class="card-text-last recent-description">${tipoFormatado} · ${escaparHtml(item.categoria || 'Sem categoria')}${dataFormatada ? ` · ${dataFormatada}` : ''}</p>
        </div>
      `
    })
    status = 'aberto'
  } else {
    if (btnUltimosGastos) {
      btnUltimosGastos.setAttribute('aria-expanded', 'false')
      btnUltimosGastos.setAttribute(
        'aria-label',
        'Expandir lançamentos recentes',
      )
    }
    gridUltimosGastos.innerHTML = ''
    status = 'fechado'
  }
}

// =============== Função de pesquisa de lançamentos =============

function formatarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function mostrarBuscaLancamentos(busca) {
  if (!gridLancamentos) {
    return
  }

  if (busca.length === 0) {
    renderizarGridLancamentos()
    return
  } else {
    gridLancamentos.innerHTML = ''
    busca.forEach((item) => {
      if (gridLancamentos) {
        gridLancamentos.innerHTML += `
        <div class="card-expenses ${item.tipo === 'ganho' ? 'income-color' : 'expense-color'}">
          <h2>${item.descricao}</h2>
          <p>R$ ${item.valor.toFixed(2).replace('.', ',')}</p>
          <p>${item.categoria}</p>
          <div class="division-card">
            <p>${item.forma}</p>
            <p>${new Date(item.data).toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
      `
      }
    })
  }
}

function buscarLancamentos() {
  const inputBusca = document.getElementById('search-text')

  if (!inputBusca) {
    return
  }

  const textoDigitado = inputBusca.value
  const textoFormatado = formatarTexto(textoDigitado)
  const filtroApp = appData.lancamentos.filter((L) => {
    return formatarTexto(L.categoria) === textoFormatado
  })
  console.log(filtroApp)
  mostrarBuscaLancamentos(filtroApp)
}

// ===================== Funções de metas =====================

window.deletarMeta = deletarMeta

async function carregarMetas() {
  try {
    const resposta = await fetch('/metas')

    if (resposta.status === 401) {
      window.location.href = 'login.html'
      return
    }

    if (!resposta.ok) {
      console.error('Erro ao carregar metas:', resposta.status)
      return
    }

    appData.metas = await resposta.json()
    renderizarDoisVisores()
  } catch (erro) {
    console.error('Erro ao carregar metas:', erro)
  }
}

if (btnCriarMeta) {
  btnCriarMeta.addEventListener('click', async () => {
    const categoriaId = document.getElementById('category-select-goals').value
    const valorMeta = document.getElementById('new-goals-input-value').value

    if (!categoriaId) {
      showPopup('Por favor, escolha uma categoria.', 2200)
      return
    }
    if (Number(valorMeta) <= 0) {
      showPopup('Por favor, insira um número válido.', 2200)
      return
    }

    try {
      const resposta = await fetch('/metas', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          categoriaId: Number(categoriaId),
          valorMax: Number(valorMeta),
          mesAno: appData.mesAtivo,
        }),
      })

      const resultado = await resposta.json()

      if (!resposta.ok) {
        showPopup(resultado.erro || 'Erro ao criar meta.', 2200)
        return
      }

      await carregarMetas()

      document.getElementById('category-select-goals').value = ''
      document.getElementById('new-goals-input-value').value = ''
      abrirOuFecharPopup('new-goals-popup', 'fechar')
    } catch (erro) {
      console.error('Erro ao criar meta:', erro)
    }
  })
}

function renderizarDoisVisores() {
  if (!visorExMeta || !visorMainMeta) {
    return
  }

  visorExMeta.innerHTML = ``
  visorMainMeta.innerHTML = ``

  if (!appData.metas) return

  appData.metas.forEach((item) => {
    if (item.mes_ano !== appData.mesAtivo) {
      return
    }

    const gastosDaCategoria = appData.lancamentos.filter((lancamento) => {
      return (
        lancamento.mesAno === appData.mesAtivo &&
        lancamento.categoria_id === item.categoria_id &&
        lancamento.tipo === 'despesa'
      )
    })

    const totalGastoMeta = gastosDaCategoria.reduce((soma, lancamento) => {
      return soma + Number(lancamento.valor)
    }, 0)

    const valorMax = Number(item.valor_max)
    const matematicaDaBarra = (totalGastoMeta / valorMax) * 100
    const stringPorcentagem = matematicaDaBarra + '%'
    const nomeFormatado = escaparHtml(primeiraLetraMaior(item.categoria))

    let cardMeta = `
      <div class="current-balance card-meta-${item.id}">
        <div class="header-meta-card">
          <h1>Gasto com ${nomeFormatado}</h1>
          <button class="btn-delete" onclick="deletarMeta(${item.id})">x</button>
        </div>
        <div class="progress-goal-container">
          <div class="progress-goal-${item.id} progress-goal"></div>
        </div>
      </div>
    `

    visorExMeta.innerHTML += cardMeta
    visorMainMeta.innerHTML += cardMeta

    const cardAtual = document.querySelectorAll(`.card-meta-${item.id}`)
    const barraProgresso = document.querySelectorAll(
      `.progress-goal-${item.id}`,
    )

    barraProgresso.forEach((barra) => {
      if (matematicaDaBarra <= 50) {
        barra.classList.add('progress-safe')
      } else if (matematicaDaBarra >= 51 && matematicaDaBarra <= 99) {
        barra.classList.add('progress-atention')
      } else {
        barra.classList.add('progress-alert')
      }
    })

    const numeroFormatado = Number(matematicaDaBarra).toFixed(2)

    cardAtual.forEach((card) => {
      card.style.setProperty('--porcentagem-local', stringPorcentagem)
      card.style.setProperty('--texto-porcentagem', `"%${numeroFormatado}"`)
    })
  })

  if (!appData.metas.some((item) => item.mes_ano === appData.mesAtivo)) {
    const vazio =
      '<p class="data-empty-state">Nenhuma meta para este mês. Crie uma meta em Lançamentos.</p>'
    visorMainMeta.innerHTML = vazio
    visorExMeta.innerHTML = vazio
  }
}

async function deletarMeta(id) {
  try {
    const resposta = await fetch(`/metas/${id}`, { method: 'DELETE' })

    if (!resposta.ok) {
      showPopup('Erro ao excluir a meta.', 2200)
      return
    }

    appData.metas = appData.metas.filter((item) => item.id !== id)
    renderizarDoisVisores()
  } catch (erro) {
    console.error('Erro ao excluir meta:', erro)
  }
}

renderizarDoisVisores()

// =================== Funções do mês =====================

function atualizarVisorMes(ano, mes) {
  if (!visorMes) {
    return
  }

  const mesmes = new Date(ano, mes - 1)
  const textoMes = mesmes.toLocaleString('pt-BR', { month: 'long' })
  const mesMaiusculo = textoMes.charAt(0).toUpperCase() + textoMes.slice(1)
  visorMes.textContent = `${mesMaiusculo} de ${ano}`
}

const mesAnoInicial = appData.mesAtivo
const [anoInicial, mesInicial] = mesAnoInicial.split('-')
if (visorMes) {
  atualizarVisorMes(Number(anoInicial), Number(mesInicial))
}

function diminuirOuAumentarMes(AumOuDim) {
  mesAno = String(appData.mesAtivo)
  let [ano, mes] = mesAno.split('-')
  let anoNum = Number(ano)
  let mesNum = Number(mes)

  if (AumOuDim === 'Aumentar') {
    mesNum += 1
    if (mesNum === 13) {
      mesNum = 1
      anoNum += 1
    }
  } else if (AumOuDim === 'Diminuir') {
    mesNum -= 1
    if (mesNum === 0) {
      mesNum = 12
      anoNum -= 1
    }
  }

  let anoStr = String(anoNum)
  let mesStr = String(mesNum)
  if (mesNum < 10) {
    mesNum = String(mesNum)
    mesStr = '0' + mesNum
  } else mesStr = String(mesNum)
  const mesAnoResul = anoStr + '-' + mesStr
  console.log(mesAnoResul)
  appData.mesAtivo = mesAnoResul

  atualizarVisorMes(anoNum, mesNum)

  salvarDados()
  atualizarTudo()
  console.log(mesAnoResul)
}

// =============== Função de abrir e fechar Popups ==============

function abrirOuFecharPopup(idPopup, acao, indice) {
  fecharPopups()
  const popupId = document.getElementById(idPopup)
  if (popupId) {
    if (acao === 'abrir') {
      indiceReservaSelecionada = indice
      popupId.classList.remove('display-none')
    } else if (acao === 'fechar') {
      popupId.classList.add('display-none')
    }
  }
}

function fecharPopups() {
  const popups = document.querySelectorAll('.modal-popup')
  popups.forEach((popup) => {
    popup.classList.add('display-none')
  })
}

// ============ função para atualizar tudo =============

function atualizarTudo() {
  renderizarAbasBancos()
  renderizarGridGastosFixos()
  renderizarGridLancamentos()
  renderizarGridReservas()
  renderizarDoisVisores()
  atualizarGridUltimos()
  renderizarAnalises()
}

const moedaBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function normalizarMes(mes) {
  const correspondencia = String(mes || '').match(/^(\d{4})-(\d{1,2})$/)
  if (!correspondencia) return null

  const numeroMes = Number(correspondencia[2])
  if (numeroMes < 1 || numeroMes > 12) return null

  return `${correspondencia[1]}-${String(numeroMes).padStart(2, '0')}`
}

function obterMesLancamento(lancamento) {
  const mesLancamento = normalizarMes(lancamento.mesAno)
  if (mesLancamento) return mesLancamento

  if (lancamento.data === null || lancamento.data === undefined) return null
  const data =
    typeof lancamento.data === 'number' || /^\d+$/.test(String(lancamento.data))
      ? new Date(Number(lancamento.data))
      : new Date(lancamento.data)

  if (Number.isNaN(data.getTime())) return null
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
}

function obterLancamentosDoMes(mes) {
  return appData.lancamentos.filter(
    (lancamento) => obterMesLancamento(lancamento) === mes,
  )
}

function obterResumoDoMes(mes) {
  return obterLancamentosDoMes(mes).reduce(
    (resumo, lancamento) => {
      const valor = Number(lancamento.valor)
      if (!Number.isFinite(valor)) return resumo

      if (lancamento.tipo === 'ganho') {
        resumo.receitas += valor
      } else {
        resumo.despesas += valor
      }

      resumo.quantidade += 1
      return resumo
    },
    { receitas: 0, despesas: 0, quantidade: 0 },
  )
}

function formatarVariacaoMensal(resumoAtual, resumoAnterior, propriedade) {
  const valorAtual = resumoAtual[propriedade]
  const valorAnterior = resumoAnterior[propriedade]

  if (resumoAtual.quantidade === 0 && resumoAnterior.quantidade === 0) {
    return 'Sem comparação'
  }
  if (valorAnterior === 0) {
    return valorAtual === 0 ? 'Sem variação' : 'Novo neste mês'
  }

  const variacao = ((valorAtual - valorAnterior) / valorAnterior) * 100
  const sinal = variacao > 0 ? '+' : ''
  return `${sinal}${variacao.toFixed(1).replace('.', ',')}% vs. mês anterior`
}

function gerarMesesHistoricos(mesReferencia, quantidade) {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const dataReferencia = new Date(ano, mes - 1, 1)

  return Array.from({ length: quantidade }, (_, indice) => {
    const dataMes = new Date(
      dataReferencia.getFullYear(),
      dataReferencia.getMonth() - quantidade + indice + 1,
      1,
    )
    return {
      chave: `${dataMes.getFullYear()}-${String(dataMes.getMonth() + 1).padStart(2, '0')}`,
      label: dataMes
        .toLocaleDateString('pt-BR', { month: 'short' })
        .replace('.', ''),
    }
  })
}

function estadoVazioGrafico(mensagem) {
  return `<div class="chart-empty" role="status"><span class="chart-empty-icon" aria-hidden="true"><i class="fa-solid fa-chart-simple"></i></span><p>${mensagem}</p></div>`
}

function renderizarGraficoBarras(meses, resumoPorMes, id, compacto = false) {
  const elemento = document.getElementById(id)
  if (!elemento) return

  const dados = meses.map((mes) => ({
    ...mes,
    ...(resumoPorMes.get(mes.chave) || {
      receitas: 0,
      despesas: 0,
      quantidade: 0,
    }),
  }))

  if (!dados.some((mes) => mes.quantidade > 0)) {
    elemento.innerHTML = estadoVazioGrafico(
      'Ainda não há lançamentos neste período.',
    )
    return
  }

  const largura = 720
  const altura = compacto ? 190 : 260
  const margem = {
    topo: 12,
    direita: 12,
    baixo: 34,
    esquerda: compacto ? 12 : 70,
  }
  const areaLargura = largura - margem.esquerda - margem.direita
  const areaAltura = altura - margem.topo - margem.baixo
  const maximo = Math.max(
    1,
    ...dados.flatMap((mes) => [mes.receitas, mes.despesas]),
  )
  const topoEscala = maximo * 1.12
  const grupo = areaLargura / dados.length
  const barraLargura = Math.min(compacto ? 14 : 24, grupo * 0.3)
  const linhas = compacto ? 2 : 4
  let conteudo = ''

  for (let linha = 0; linha <= linhas; linha += 1) {
    const y = margem.topo + (areaAltura / linhas) * linha
    const valor = topoEscala * (1 - linha / linhas)
    conteudo += `<line class="chart-grid-line" x1="${margem.esquerda}" y1="${y}" x2="${largura - margem.direita}" y2="${y}"/>`
    if (!compacto) {
      conteudo += `<text class="chart-axis-label" x="${margem.esquerda - 10}" y="${y + 4}" text-anchor="end">${moedaBRL.format(valor)}</text>`
    }
  }

  dados.forEach((mes, indice) => {
    const centro = margem.esquerda + grupo * indice + grupo / 2
    const receitasAltura = (mes.receitas / topoEscala) * areaAltura
    const despesasAltura = (mes.despesas / topoEscala) * areaAltura
    const xReceita = centro - barraLargura - 2
    const xDespesa = centro + 2
    const yReceita = margem.topo + areaAltura - receitasAltura
    const yDespesa = margem.topo + areaAltura - despesasAltura
    const tituloMes = `${mes.label} — receitas ${moedaBRL.format(mes.receitas)}, despesas ${moedaBRL.format(mes.despesas)}`

    conteudo += `<rect class="chart-bar chart-bar-income" x="${xReceita}" y="${yReceita}" width="${barraLargura}" height="${Math.max(0, receitasAltura)}" rx="4"><title>${escaparHtml(tituloMes)}</title></rect>`
    conteudo += `<rect class="chart-bar chart-bar-expense" x="${xDespesa}" y="${yDespesa}" width="${barraLargura}" height="${Math.max(0, despesasAltura)}" rx="4"><title>${escaparHtml(tituloMes)}</title></rect>`
    conteudo += `<text class="chart-month-label" x="${centro}" y="${altura - 9}" text-anchor="middle">${escaparHtml(mes.label)}</text>`
  })

  elemento.innerHTML = `<svg class="financial-chart" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Gráfico mensal comparando receitas e despesas">${conteudo}</svg>`
}

function renderizarGraficoCategorias(lancamentos, id) {
  const elemento = document.getElementById(id)
  if (!elemento) return

  const categorias = new Map()
  lancamentos.forEach((lancamento) => {
    if (lancamento.tipo === 'ganho') return
    const nome = String(lancamento.categoria || 'Outros')
    const valor = Number(lancamento.valor)
    if (!Number.isFinite(valor)) return
    categorias.set(nome, (categorias.get(nome) || 0) + valor)
  })

  const ordenadas = [...categorias.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
  if (ordenadas.length === 0) {
    elemento.innerHTML = estadoVazioGrafico(
      'Sem despesas registradas neste mês.',
    )
    return
  }

  const maximo = Math.max(...ordenadas.map(([, valor]) => valor), 1)
  const total = ordenadas.reduce((soma, [, valor]) => soma + valor, 0)
  elemento.innerHTML = `<div class="category-bars">${ordenadas
    .map(([nome, valor]) => {
      const percentual = total > 0 ? (valor / total) * 100 : 0
      const largura = (valor / maximo) * 100
      return `<div class="category-bar-item"><div class="category-bar-heading"><span title="${escaparHtml(nome)}">${escaparHtml(nome)}</span><strong>${moedaBRL.format(valor)}</strong></div><div class="category-bar-track" role="img" aria-label="${escaparHtml(nome)}: ${moedaBRL.format(valor)}, ${percentual.toFixed(0)} por cento"><span style="width:${largura}%"></span></div></div>`
    })
    .join('')}</div>`
}

function renderizarGraficoResultado(meses, resumoPorMes, id) {
  const elemento = document.getElementById(id)
  if (!elemento) return
  if (
    !meses.some((mes) => (resumoPorMes.get(mes.chave)?.quantidade || 0) > 0)
  ) {
    elemento.innerHTML = estadoVazioGrafico(
      'Os dados aparecerão quando houver lançamentos.',
    )
    return
  }

  let acumulado = 0
  const pontos = meses.map((mes, indice) => {
    const resumo = resumoPorMes.get(mes.chave) || { receitas: 0, despesas: 0 }
    acumulado += resumo.receitas - resumo.despesas
    return { ...mes, valor: acumulado, indice }
  })
  const largura = 720
  const altura = 230
  const margem = { topo: 18, direita: 18, baixo: 34, esquerda: 70 }
  const valores = pontos.map((ponto) => ponto.valor)
  const minimo = Math.min(0, ...valores)
  const maximo = Math.max(0, ...valores)
  const intervalo = maximo - minimo || 1
  const areaAltura = altura - margem.topo - margem.baixo
  const areaLargura = largura - margem.esquerda - margem.direita
  const coordenadas = pontos.map((ponto) => ({
    ...ponto,
    x:
      margem.esquerda +
      (pontos.length === 1
        ? areaLargura / 2
        : (areaLargura * ponto.indice) / (pontos.length - 1)),
    y: margem.topo + ((maximo - ponto.valor) / intervalo) * areaAltura,
  }))
  const linhaZero = margem.topo + (maximo / intervalo) * areaAltura
  const path = coordenadas
    .map((ponto, indice) => `${indice === 0 ? 'M' : 'L'} ${ponto.x} ${ponto.y}`)
    .join(' ')
  const marcadores = coordenadas
    .map(
      (ponto) =>
        `<circle class="chart-point" cx="${ponto.x}" cy="${ponto.y}" r="4"><title>${escaparHtml(`${ponto.label}: ${moedaBRL.format(ponto.valor)}`)}</title></circle><text class="chart-month-label" x="${ponto.x}" y="${altura - 9}" text-anchor="middle">${escaparHtml(ponto.label)}</text>`,
    )
    .join('')
  const eixo = `<line class="chart-grid-line" x1="${margem.esquerda}" y1="${linhaZero}" x2="${largura - margem.direita}" y2="${linhaZero}"/><text class="chart-axis-label" x="${margem.esquerda - 10}" y="${linhaZero + 4}" text-anchor="end">R$ 0</text>`

  elemento.innerHTML = `<svg class="financial-chart" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Evolução acumulada do resultado líquido do período"><path class="chart-line" d="${path}"/>${eixo}${marcadores}</svg>`
}

function renderizarAnalises() {
  const referenciaInput = document.getElementById('analysis-month')
  const filtroPeriodo = document.getElementById('analysis-range')
  const mesReferencia =
    normalizarMes(referenciaInput?.value) || normalizarMes(appData.mesAtivo)
  if (!mesReferencia) return

  if (referenciaInput && !referenciaInput.value) {
    referenciaInput.value = mesReferencia
  }

  if (estadoCarregamentoLancamentos !== 'loaded') {
    const textoEstado =
      estadoCarregamentoLancamentos === 'error'
        ? 'Não foi possível carregar estes dados. Tente novamente.'
        : 'Carregando seus lançamentos...'
    ;[
      'dashboard-trend-chart',
      'analysis-flow-chart',
      'analysis-category-chart',
      'analysis-balance-chart',
    ].forEach((id) => {
      const grafico = document.getElementById(id)
      if (grafico) grafico.innerHTML = estadoVazioGrafico(textoEstado)
    })
    ;[
      'month-income',
      'analysis-income',
      'analysis-expenses',
      'analysis-net',
      'analysis-expense-change',
      'dashboard-income-change',
      'dashboard-expense-change',
    ].forEach((id) => {
      const elemento = document.getElementById(id)
      if (elemento) elemento.textContent = '—'
    })
    return
  }

  const resumoAtual = obterResumoDoMes(mesReferencia)
  const dataReferencia = new Date(`${mesReferencia}-01T00:00:00`)
  const dataAnterior = new Date(
    dataReferencia.getFullYear(),
    dataReferencia.getMonth() - 1,
    1,
  )
  const mesAnterior = `${dataAnterior.getFullYear()}-${String(dataAnterior.getMonth() + 1).padStart(2, '0')}`
  const resumoAnterior = obterResumoDoMes(mesAnterior)
  const variacaoVisor = document.getElementById('analysis-expense-change')

  const definirTexto = (id, texto) => {
    const elemento = document.getElementById(id)
    if (elemento) elemento.textContent = texto
  }

  const mesDashboard = normalizarMes(appData.mesAtivo) || mesReferencia
  const resumoDashboardAtual = obterResumoDoMes(mesDashboard)
  const [anoDashboard, mesDashboardNum] = mesDashboard.split('-').map(Number)
  const dataDashboardAnterior = new Date(anoDashboard, mesDashboardNum - 2, 1)
  const mesDashboardAnterior = `${dataDashboardAnterior.getFullYear()}-${String(dataDashboardAnterior.getMonth() + 1).padStart(2, '0')}`
  const resumoDashboardAnterior = obterResumoDoMes(mesDashboardAnterior)
  definirTexto('month-income', moedaBRL.format(resumoDashboardAtual.receitas))
  definirTexto(
    'dashboard-income-change',
    formatarVariacaoMensal(
      resumoDashboardAtual,
      resumoDashboardAnterior,
      'receitas',
    ),
  )
  definirTexto(
    'dashboard-expense-change',
    formatarVariacaoMensal(
      resumoDashboardAtual,
      resumoDashboardAnterior,
      'despesas',
    ),
  )
  definirTexto('analysis-income', moedaBRL.format(resumoAtual.receitas))
  definirTexto('analysis-expenses', moedaBRL.format(resumoAtual.despesas))
  definirTexto(
    'analysis-net',
    moedaBRL.format(resumoAtual.receitas - resumoAtual.despesas),
  )

  if (variacaoVisor) {
    variacaoVisor.textContent = formatarVariacaoMensal(
      resumoAtual,
      resumoAnterior,
      'despesas',
    )
  }

  const quantidadeMeses = Number(filtroPeriodo?.value) || 6
  const meses = gerarMesesHistoricos(mesReferencia, quantidadeMeses)
  const resumoPorMes = new Map(
    meses.map((mes) => [mes.chave, obterResumoDoMes(mes.chave)]),
  )
  renderizarGraficoBarras(meses, resumoPorMes, 'analysis-flow-chart')
  renderizarGraficoResultado(meses, resumoPorMes, 'analysis-balance-chart')
  renderizarGraficoCategorias(
    obterLancamentosDoMes(mesReferencia),
    'analysis-category-chart',
  )

  const mesesDashboard = gerarMesesHistoricos(mesDashboard, 6)
  const resumoDashboard = new Map(
    mesesDashboard.map((mes) => [mes.chave, obterResumoDoMes(mes.chave)]),
  )
  renderizarGraficoBarras(
    mesesDashboard,
    resumoDashboard,
    'dashboard-trend-chart',
    true,
  )
}

document
  .getElementById('analysis-month')
  ?.addEventListener('change', renderizarAnalises)
document
  .getElementById('analysis-range')
  ?.addEventListener('change', renderizarAnalises)

// ============ função pra pegar os itens do MySql =====//

let estadoCarregamentoLancamentos = 'loading'

function atualizarEstadoDadosFinanceiros(mensagem, erro = false) {
  estadoCarregamentoLancamentos = erro
    ? 'error'
    : mensagem
      ? 'loading'
      : 'loaded'

  const estado = document.getElementById('financial-data-status')
  if (!estado) return

  const mensagemGrafico = erro
    ? 'Não foi possível carregar estes dados. Tente novamente.'
    : 'Carregando seus lançamentos...'
  ;[
    'dashboard-trend-chart',
    'analysis-flow-chart',
    'analysis-category-chart',
    'analysis-balance-chart',
  ].forEach((id) => {
    const grafico = document.getElementById(id)
    if (grafico && mensagem) {
      grafico.innerHTML = estadoVazioGrafico(mensagemGrafico)
    }
  })

  estado.replaceChildren()
  estado.hidden = !mensagem
  if (!mensagem) return

  const texto = document.createElement('span')
  texto.textContent = mensagem
  estado.appendChild(texto)

  if (erro) {
    const botaoTentarNovamente = document.createElement('button')
    botaoTentarNovamente.type = 'button'
    botaoTentarNovamente.className = 'data-retry'
    botaoTentarNovamente.textContent = 'Tentar novamente'
    botaoTentarNovamente.addEventListener('click', carregarLancamento)
    estado.appendChild(botaoTentarNovamente)
  }
}

async function carregarLancamento() {
  atualizarEstadoDadosFinanceiros('Carregando seus lançamentos...')

  try {
    const resposta = await fetch('/lancamentos')

    if (resposta.status === 401) {
      window.location.href = 'login.html'
      return
    }

    if (!resposta.ok) {
      console.error('Erro ao carregar lançamentos:', resposta.status)
      atualizarEstadoDadosFinanceiros(
        'Não foi possível carregar os lançamentos. Verifique a conexão e tente novamente.',
        true,
      )
      return
    }

    const lancamentos = await resposta.json()

    if (!Array.isArray(lancamentos)) {
      console.error('Resposta inválida de /lancamentos:', lancamentos)
      atualizarEstadoDadosFinanceiros(
        'Os dados recebidos não puderam ser exibidos. Tente carregar novamente.',
        true,
      )
      return
    }

    appData.lancamentos = lancamentos
    atualizarEstadoDadosFinanceiros('')

    console.log('Lançamentos do banco:', lancamentos)

    atualizarTudo()
  } catch (erro) {
    console.error('Erro ao carregar lançamentos:', erro)
    atualizarEstadoDadosFinanceiros(
      'Não foi possível carregar os lançamentos. Verifique a conexão e tente novamente.',
      true,
    )
  }
}

//============== BANCOS PARA SELECIOAR ===============//

function renderizarAbasBancos() {
  if (!listBancosAbas) return

  listBancosAbas.innerHTML = ''

  appData.bancos.forEach((banco) => {
    const classeAtiva =
      Number(banco.id) === Number(appData.bancoAtual) ? 'banco-active' : ''

    listBancosAbas.innerHTML += `
      <div class="btns-aba-bancos">
        <button
          class="btn-aba-banco ${classeAtiva}"
          onclick="selecionarBanco(${banco.id})"
        >
          ${banco.nome}
        </button>

        <button
          class="btn-aba-banco color-red-btn"
          onclick="excluirBanco(${banco.id})"
        >
          -
        </button>
      </div>
    `
  })

  if (appData.bancos.length === 0) {
    listBancosAbas.innerHTML =
      '<span class="banks-empty">Nenhuma conta cadastrada</span>'
  }
}

function selecionarBanco(id) {
  appData.bancoAtual = id
  salvarDados()
  atualizarTudo()
}

if (btnSubmitBanco) {
  btnSubmitBanco.addEventListener('click', async () => {
    const inputNome = document.querySelector('#banco-name')
    const inputSaldo = document.querySelector('#banco-saldo-inicial')

    if (!inputNome.value) {
      showPopup('Por favor, digite o nome do banco.', 2200)
      return
    }

    if (Number(inputSaldo.value) < 0) {
      showPopup('Por favor, insira um número válido.', 2200)
      return
    }

    const novoBanco = {
      mesCriado: appData.mesAtivo,
      nome: inputNome.value,
      saldoInicial: Number(inputSaldo.value) || 0,
    }

    const resposta = await fetch('/bancos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(novoBanco),
    })

    const resultado = await resposta.json()

    console.log(resultado)

    appData.bancos.push(resultado.banco)
    selecionarBanco(resultado.banco.id)

    inputNome.value = ''
    inputSaldo.value = ''
    modalPopupBanco.classList.add('display-none')

    carregarBancos()

    if (existeBanco === 'nao') {
      existeBanco = 'sim'
      console.log(existeBanco)
    }
  })
}

async function carregarBancos() {
  try {
    const resposta = await fetch('/bancos')

    if (resposta.status === 401) {
      window.location.href = 'login.html'
      return
    }

    if (!resposta.ok) {
      console.error('Erro ao carregar bancos:', resposta.status)
      return
    }

    const bancos = await resposta.json()

    if (!Array.isArray(bancos)) {
      console.error('Resposta inválida de /bancos:', bancos)
      return
    }

    appData.bancos = bancos

    if (appData.bancos.length === 0) {
      await criarBancoInicial()
      return
    }

    const bancoAtualExiste = appData.bancos.some(
      (banco) => Number(banco.id) === Number(appData.bancoAtual),
    )

    if (!bancoAtualExiste) {
      selecionarBanco(appData.bancos[0].id)
    }

    console.log('Bancos do banco de dados:', bancos)

    atualizarTudo()
  } catch (erro) {
    console.error('Erro ao carregar bancos:', erro)
  }
}

let existeBanco = appData.bancos.length > 0 ? 'sim' : 'nao'

async function criarBancoInicial() {
  const novoBanco = {
    mesCriado: appData.mesAtivo,
    nome: 'Banco Inicial',
    saldoInicial: 0,
  }

  const resposta = await fetch('/bancos', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(novoBanco),
  })

  const resultado = await resposta.json()

  appData.bancos.push(resultado.banco)

  selecionarBanco(resultado.banco.id)
}

async function excluirBanco(id) {
  const banco = appData.bancos.find((banco) => Number(banco.id) === Number(id))

  if (!banco) return

  const confirmar = confirm(
    `Deseja excluir o banco "${banco.nome}"? Os lançamentos dele também serão excluídos.`,
  )

  if (!confirmar) return

  const resposta = await fetch(`/bancos/${id}`, {
    method: 'DELETE',
  })

  const resultado = await resposta.json()

  console.log(resultado)

  if (!resposta.ok) {
    alert('Erro ao excluir banco.')
    return
  }

  appData.bancos = appData.bancos.filter(
    (banco) => Number(banco.id) !== Number(id),
  )

  appData.lancamentos = appData.lancamentos.filter(
    (lancamento) => Number(lancamento.bancoId) !== Number(id),
  )

  if (appData.bancos.length === 0) {
    await criarBancoInicial()
  } else {
    selecionarBanco(appData.bancos[0].id)
  }

  atualizarTudo()
}

renderizarAbasBancos()

//----------------------Coisas Das Reservas----------------------

async function carregarReservas() {
  try {
    const resposta = await fetch('/reservas')

    if (resposta.status === 401) {
      window.location.href = 'login.html'
      return
    }

    if (!resposta.ok) {
      console.error('Erro ao carregar reservas:', resposta.status)
      return
    }

    const reservas = await resposta.json()

    if (!Array.isArray(reservas)) {
      console.error('Resposta inválida de /reservas:', reservas)
      return
    }

    appData.reservas = reservas

    console.log('Reservas do banco:', reservas)

    atualizarTudo()
  } catch (erro) {
    console.error('Erro ao carregar reservas:', erro)
  }
}

//BOTAO PRA ADICIONAR NOVA RESERVA
if (btnAddReserva) {
  btnAddReserva.addEventListener('click', async () => {
    const novaReserva = {
      nome: document.querySelector('#reserve-name').value,
      valor: Number(document.querySelector('#reserve-value').value),
    }

    const totalBancos = appData.bancos.reduce((soma, b) => {
      if (b.mesCriado === appData.mesAtivo) {
        return soma + Number(b.saldoInicial)
      }
      return soma
    }, 0)
    let dinheiroLivre = totalBancos

    appData.lancamentos.forEach((item) => {
      if (item.mesAno !== appData.mesAtivo) {
        return
      }

      if (item.tipo === 'ganho') {
        dinheiroLivre += Number(item.valor)
      }
      if (item.tipo === 'despesa') {
        dinheiroLivre -= Number(item.valor)
      }
    })
    appData.reservas.forEach((item) => {
      dinheiroLivre -= Number(item.valor)
    })

    if (novaReserva.valor < 0 || novaReserva.valor > dinheiroLivre) {
      showPopup('Valor inválido para a reserva.', 2400)
      return
    }
    if (!novaReserva.nome) {
      showPopup('Por favor, insira um nome para a reserva.', 2200)
      return
    }

    const resposta = await fetch('/reservas', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(novaReserva),
    })

    const resultado = await resposta.json()

    appData.reservas.push(resultado.reserva)

    document.querySelector('#reserve-name').value = ''
    document.querySelector('#reserve-value').value = ''

    atualizarTudo()

    abrirOuFecharPopup('popup-reserve', 'fechar')
  })
}

// ADICIONAR VALOR PRA RESERVA USANDO INDICE
if (btnAdicionarValorReserva) {
  btnAdicionarValorReserva.addEventListener('click', async () => {
    if (indiceReservaSelecionada === null) return

    const valor = Number(document.querySelector('#plus-value-reserve').value)

    if (!Number.isFinite(valor) || valor <= 0) {
      showPopup('Insira um valor válido.', 2200)
      return
    }

    try {
      const resposta = await fetch(`/reservas/${indiceReservaSelecionada}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'adicionar', valor }),
      })

      if (!resposta.ok) {
        showPopup('Erro ao atualizar reserva.', 2200)
        return
      }

      const reserva = appData.reservas.find(
        (r) => r.id === indiceReservaSelecionada,
      )
      if (reserva) reserva.valor = Number(reserva.valor) + valor

      atualizarTudo()
      abrirOuFecharPopup('modal-add', 'fechar')
      document.querySelector('#plus-value-reserve').value = ''
      indiceReservaSelecionada = null
    } catch {
      showPopup('Erro de conexão.', 2200)
    }
  })
}

//RETIRAR O VALOR DA RESERVA USANDO INDICE
if (btnTirarValor) {
  btnTirarValor.addEventListener('click', async () => {
    if (indiceReservaSelecionada === null) return

    const valor = Number(document.querySelector('#minus-value-reserve').value)

    if (!Number.isFinite(valor) || valor <= 0) {
      showPopup('Insira um valor válido.', 2200)
      return
    }

    const reserva = appData.reservas.find(
      (r) => r.id === indiceReservaSelecionada,
    )

    if (reserva && valor > Number(reserva.valor)) {
      showPopup('Valor maior que o saldo da reserva.', 2200)
      return
    }

    try {
      const resposta = await fetch(`/reservas/${indiceReservaSelecionada}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'retirar', valor }),
      })

      if (!resposta.ok) {
        const dados = await resposta.json()
        showPopup(dados.erro || 'Erro ao atualizar reserva.', 2200)
        return
      }

      if (reserva) reserva.valor = Number(reserva.valor) - valor

      atualizarTudo()
      abrirOuFecharPopup('modal-minus', 'fechar')
      document.querySelector('#minus-value-reserve').value = ''
      indiceReservaSelecionada = null
    } catch {
      showPopup('Erro de conexão.', 2200)
    }
  })
}

//MOSTRA NA PAGINA AS RESERVAS
function renderizarGridReservas() {
  if (!gridReservas || !totalReservadoVisor) {
    return
  }

  valorTotalReservado = 0
  gridReservas.innerHTML = ''
  totalReservadoVisor.innerHTML = 'R$ 0,00'

  appData.reservas.forEach((item, indice) => {
    gridReservas.innerHTML += `
      <div class="card-expenses">
        <div class="especifications">
          <h2>${item.nome}</h2>
          <p>R$ ${Number(item.valor).toFixed(2).replace('.', ',')}</p>
        </div>
        <div class="btns-delete-plus-minus">
          <div class="change-btns half">
            <button class="btn-plus-minus" id="plus-btn" onclick="abrirOuFecharPopup('modal-add', 'abrir', ${item.id})">+</button>
            <button class="btn-plus-minus" id="minus-btn" onclick="abrirOuFecharPopup('modal-minus', 'abrir', ${item.id})">-</button>
          </div>
          <button class="btn-delete half" onclick="excluirReservas(${item.id})">Excluir</button>
        </div>
      </div>
    `

    valorTotalReservado += Number(item.valor)
    ;(totalReservadoVisor.textContent =
      'R$' + valorTotalReservado.toFixed(2)).replace('.', ',')
  })

  if (appData.reservas.length === 0) {
    gridReservas.innerHTML =
      '<p class="grid-none-expenses data-empty-state">Suas reservas aparecerão aqui quando você criar a primeira.</p>'
  }
}

//FUNÇÃO PARA EXCLUIR A RESERVA
async function excluirReservas(id) {
  if (!confirm('Tem certeza que deseja excluir esta reserva?')) return

  try {
    const resposta = await fetch(`/reservas/${id}`, { method: 'DELETE' })

    if (!resposta.ok) {
      showPopup('Erro ao excluir reserva.', 2200)
      return
    }

    appData.reservas = appData.reservas.filter((r) => r.id !== id)
    atualizarTudo()
  } catch {
    showPopup('Erro de conexão ao excluir reserva.', 2200)
  }
}

//----------------------Coisas dos Gastos Fixos-------------------------

window.alternarStatusGastoFixo = alternarStatusGastoFixo
window.deletarGastoFixo = deletarGastoFixo

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function carregarGastosFixos() {
  try {
    const resposta = await fetch('/gastos-fixos')

    if (resposta.status === 401) {
      window.location.href = 'login.html'
      return
    }

    if (!resposta.ok) {
      console.error('Erro ao carregar gastos fixos:', resposta.status)
      return
    }

    const gastos = await resposta.json()

    if (!Array.isArray(gastos)) return

    appData.pendencias = gastos
    atualizarTudo()
  } catch (erro) {
    console.error('Erro ao carregar gastos fixos:', erro)
  }
}

async function alternarStatusGastoFixo(id) {
  const gasto = appData.pendencias.find((item) => item.id === id)
  if (!gasto) return

  const novoStatus = gasto.status === 'pago' ? 'pendente' : 'pago'

  try {
    const resposta = await fetch(`/gastos-fixos/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: novoStatus }),
    })

    if (!resposta.ok) {
      showPopup('Erro ao atualizar o gasto fixo.', 2200)
      return
    }

    gasto.status = novoStatus
    atualizarTudo()
  } catch (erro) {
    console.error('Erro ao atualizar gasto fixo:', erro)
  }
}

async function deletarGastoFixo(id) {
  try {
    const resposta = await fetch(`/gastos-fixos/${id}`, { method: 'DELETE' })

    if (!resposta.ok) {
      showPopup('Erro ao excluir o gasto fixo.', 2200)
      return
    }

    appData.pendencias = appData.pendencias.filter((item) => item.id !== id)
    atualizarTudo()
  } catch (erro) {
    console.error('Erro ao excluir gasto fixo:', erro)
  }
}

function renderizarGridGastosFixos() {
  if (!gridGastosFixos || !gastosFixosMain) return

  gastosFixosMain.innerHTML = ''
  gridGastosFixos.innerHTML = ''

  appData.pendencias.forEach((item) => {
    const ehPago = item.status === 'pago'
    const classeStatus = ehPago ? 'pago' : 'pending'
    const textoBotao = ehPago ? 'Pago' : 'Pendente'
    const nomeSeguro = escaparHtml(item.nome)
    const valorFormatado = Number(item.valor).toFixed(2).replace('.', ',')

    gridGastosFixos.innerHTML += `
    <div class="card-expenses">
      <div class="especifications">
        <h2>${nomeSeguro}</h2>
        <p>R$ ${valorFormatado}</p>
      </div>
      <div class="btns-new-expenses">
        <button class="change-btn ${classeStatus}" onclick="alternarStatusGastoFixo(${item.id})">
          ${textoBotao}
        </button>
        <button class="btn-delete" onclick="deletarGastoFixo(${item.id})">Excluir</button>
      </div>
    </div>
    `
    gastosFixosMain.innerHTML += `
    <div class="fixed-card-main">
      <h1 class="title-fixed-main">${nomeSeguro}</h1>
      <p class="pending-type-main">${textoBotao}</p>
    </div>
    `
  })

  if (appData.pendencias.length === 0) {
    const vazio =
      '<p class="data-empty-state">Nenhum gasto fixo cadastrado.</p>'
    gridGastosFixos.innerHTML = vazio
    gastosFixosMain.innerHTML = vazio
  }
}

if (btnAddGastoFixo) {
  btnAddGastoFixo.addEventListener('click', async () => {
    const nome = document.getElementById('fixed-expense-name').value.trim()
    const valor = Number(document.getElementById('fixed-expense-value').value)

    if (!nome || !valor) {
      showPopup('Preencha nome e valor do gasto fixo.', 2200)
      return
    }

    try {
      const resposta = await fetch('/gastos-fixos', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ nome, valor }),
      })

      if (!resposta.ok) {
        showPopup('Erro ao salvar o gasto fixo.', 2200)
        return
      }

      const resultado = await resposta.json()

      appData.pendencias.push(resultado.gastoFixo)

      document.getElementById('fixed-expense-value').value = ''
      document.getElementById('fixed-expense-name').value = ''

      abrirOuFecharPopup('popup-fixed-expense', 'fechar')
      atualizarTudo()
    } catch (erro) {
      console.error('Erro ao criar gasto fixo:', erro)
    }
  })
}

//-----------------------------------------------------------------

function renderizarGridLancamentos() {
  if (gridLancamentos) gridLancamentos.innerHTML = ''
  const idProcurado = appData.bancoAtual
  const bancoObjeto = appData.bancos.find(
    (b) => b && Number(b.id) === Number(idProcurado),
  )
  let saldoBancoSelecionadoNum = 0
  if (bancoObjeto) {
    if (bancoObjeto.mesCriado === appData.mesAtivo) {
      saldoBancoSelecionadoNum = Number(bancoObjeto.saldoInicial)
    }
  }
  let totalTodosBancosNum = appData.bancos.reduce((soma, b) => {
    if (!b) return soma

    if (b.mesCriado === appData.mesAtivo) {
      return soma + Number(b.saldoInicial)
    }

    return soma
  }, 0)
  let totalGastoNum = 0

  appData.lancamentos.forEach((item, indice) => {
    const valorItem = Number(item.valor)

    if (item.mesAno !== appData.mesAtivo) {
      return
    }

    if (item.tipo === 'ganho') {
      totalTodosBancosNum += valorItem
    } else {
      totalTodosBancosNum -= valorItem
      totalGastoNum += valorItem
    }

    if (Number(item.bancoId) === Number(idProcurado)) {
      if (item.tipo === 'ganho') {
        saldoBancoSelecionadoNum += valorItem
      } else {
        saldoBancoSelecionadoNum -= valorItem
      }

      if (gridLancamentos) {
        gridLancamentos.innerHTML += `
        <div class="card-expenses ${item.tipo === 'ganho' ? 'income-color' : 'expense-color'}">
          <h2>${item.descricao}</h2>
          <p>R$ ${valorItem.toFixed(2).replace('.', ',')}</p>
          <p>${item.categoria}</p>
          <div class="division-card">
            <p>${item.forma}</p>
            <p>${new Date(item.data).toLocaleDateString('pt-BR')}</p>
          </div>
          <button class="btn-delete" id="delete-btn-card" onclick="deletarLancamento(${item.id})">Excluir</button>
        </div>
      `
      }
    }
  })

  if (gridLancamentos && gridLancamentos.children.length === 0) {
    gridLancamentos.innerHTML =
      '<p class="grid-none-expenses data-empty-state">Nenhum lançamento nesta conta e período.</p>'
  }

  let totalParaGastarNum = totalTodosBancosNum - valorTotalReservado
  if (saldoAtual) {
    saldoAtual.textContent =
      'R$ ' + totalParaGastarNum.toFixed(2).replace('.', ',')
  }
  if (totalDinheiroVisor) {
    totalDinheiroVisor.textContent =
      'R$ ' + totalTodosBancosNum.toFixed(2).replace('.', ',')
  }
  if (totalGasto) {
    totalGasto.textContent = 'R$ ' + totalGastoNum.toFixed(2).replace('.', ',')
  }
  if (saldoBancoVisor) {
    saldoBancoVisor.textContent =
      'R$ ' + saldoBancoSelecionadoNum.toFixed(2).replace('.', ',')
  }
}

async function deletarLancamento(id) {
  console.log(id)

  const resposta = await fetch(`/lancamentos/${id}`, {
    method: 'DELETE',
  })

  const resultado = await resposta.json()

  console.log(resultado)

  const indice = appData.lancamentos.findIndex(
    (lancamento) => Number(lancamento.id) === Number(id),
  )

  if (indice !== -1) {
    appData.lancamentos.splice(indice, 1)
  }

  atualizarTudo()
}

//deixa o botao sem o visual de selecionado
function desmarcarBotao() {
  if (btnGasto) btnGasto.classList.remove('btn-selected-ex')
  if (btnRecebimento) btnRecebimento.classList.remove('btn-selected-in')
}

//seleciona o tipo pra gasto
if (btnGasto) {
  btnGasto.addEventListener('click', () => {
    btnRecebimento.classList.remove('btn-selected-in')
    btnGasto.classList.add('btn-selected-ex')
    tipoSelecionado = 'despesa'
  })
}

//seleciona o tipo pra ganho
if (btnRecebimento) {
  btnRecebimento.addEventListener('click', () => {
    console.log('mudou')
    btnGasto.classList.remove('btn-selected-ex')
    btnRecebimento.classList.add('btn-selected-in')
    tipoSelecionado = 'ganho'
  })
}

if (btnAddLancamento) {
  btnAddLancamento.addEventListener('click', async () => {
    if (existeBanco === 'sim') {
      const inputData = document.getElementById('dateInput').value
      const mesAnoDoLancamento = appData.mesAtivo
      const dataLancamento = inputData
        ? new Date(inputData).getTime()
        : Date.now()
      const novoLancamento = {
        tipo: tipoSelecionado,
        valor: Number(document.getElementById('valueInput').value),
        categoriaId: Number(document.getElementById('category-select').value),
        descricao: document.getElementById('descriptionInput').value,
        forma: document.getElementById('payment-select').value,
        data: dataLancamento,
        mesAno: mesAnoDoLancamento,
        bancoId: appData.bancoAtual,
      }

      if (novoLancamento.tipo === 'despesa') {
        const metaEncontrada = appData.metas.find(
          (meta) =>
            meta.categoria_id === novoLancamento.categoriaId &&
            meta.mes_ano === appData.mesAtivo,
        )

        if (metaEncontrada) {
          const gastosDaCategoria = appData.lancamentos.filter((lancamento) => {
            return (
              lancamento.mesAno === appData.mesAtivo &&
              lancamento.categoria_id === metaEncontrada.categoria_id &&
              lancamento.tipo === 'despesa'
            )
          })

          const totalGasto = gastosDaCategoria.reduce((soma, lancamento) => {
            return soma + Number(lancamento.valor)
          }, 0)

          const gastoComInput = totalGasto + novoLancamento.valor

          if (gastoComInput > Number(metaEncontrada.valor_max)) {
            let resposta = confirm(
              'Valor irá exceder a meta, deseja continuar?',
            )
            if (resposta === false) {
              return
            }
          }
        }
      }

      const resposta = await fetch('/lancamentos', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(novoLancamento),
      })

      const resultado = await resposta.json()
      console.log(resultado)

      appData.lancamentos.push(resultado.lancamento)
      atualizarTudo()
      abrirOuFecharPopup('popup-modal', 'fechar')

      document.getElementById('valueInput').value = ''
      document.getElementById('category-select').value = ''
      document.getElementById('descriptionInput').value = ''
      document.getElementById('payment-select').value = ''
      tipoSelecionado = 'despesa'
    } else {
      showPopup('Você não possui nenhum banco. Crie um banco primeiro.', 2600)
      abrirOuFecharPopup('popup-novo-banco', 'abrir')
      return
    }
  })
}

//-----------------------------------------------------------------
// login/cadastro functions //

const botoesAlternarSenha = document.querySelectorAll('.toggle-visibility')

botoesAlternarSenha.forEach((botao) => {
  botao.addEventListener('click', () => {
    const campoSenha = botao
      .closest('.field-password-wrap')
      ?.querySelector('input')

    if (!campoSenha) {
      return
    }

    const senhaVisivel = campoSenha.type === 'text'
    campoSenha.type = senhaVisivel ? 'password' : 'text'
    botao.textContent = senhaVisivel ? 'mostrar' : 'ocultar'
    botao.setAttribute(
      'aria-label',
      senhaVisivel ? 'Mostrar senha' : 'Ocultar senha',
    )
  })
})

const btnCriarContaLogin = document.querySelector('#btn-criar-conta')

if (btnCriarContaLogin) {
  btnCriarContaLogin.addEventListener('click', () => {
    window.location.href = 'cadastro.html'
  })
}

const btnRecuperarSenha = document.querySelector('#esqueci-senha-btn')

if (btnRecuperarSenha) {
  btnRecuperarSenha.addEventListener('click', () => {
    window.location.href = 'recuperar-senha.html'
  })
}

async function confirmarLogout(callback) {
  const desejaSair = window.confirm('Deseja realmente sair?')

  if (!desejaSair) {
    return
  }

  const resposta = await fetch('/logout', {
    method: 'POST',
    headers: authHeaders(),
  })

  if (resposta.ok) {
    localStorage.removeItem('metodoAutenticacao')
    if (typeof callback === 'function') {
      callback()
    }
  } else {
    showPopup('Não foi possível sair agora. Tente novamente.', 2600)
  }
}

const loginForm = document.querySelector('#login-form')

if (loginForm) {
  loginForm.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    const emailDig = document.querySelector('#email')
    const senhaDig = document.querySelector('#senha')

    const email = emailDig.value
    const senha = senhaDig.value

    const novaConta = {
      email: email,
      senha: senha,
    }

    const resposta = await fetch('/login', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(novaConta),
    })

    if (resposta.ok) {
      localStorage.setItem('metodoAutenticacao', 'senha')
      window.location.href = 'index.html'
    } else if (resposta.status === 429) {
      const dados = await resposta.json()
      showPopup(dados.erro, 4000)
    } else {
      showPopup('E-mail ou senha inválidos.', 2600)
    }
  })
}

//cadastro

const senhaInput = document.getElementById('senha')
const confirmarSenhaInput = document.getElementById('confirmar-senha')

const bar1 = document.getElementById('bar-1')
const bar2 = document.getElementById('bar-2')
const bar3 = document.getElementById('bar-3')

const strengthLabel = document.getElementById('strength-label')
const confirmacaoLabel = document.getElementById('confirmacao-label')

function avaliarForcaSenha(senha) {
  let pontos = 0

  if (senha.length >= 12) {
    pontos++
  }

  if (senha.length >= 16) {
    pontos++
  }

  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) {
    pontos++
  }

  if (/[0-9]/.test(senha)) {
    pontos++
  }

  if (/[^A-Za-z0-9]/.test(senha)) {
    pontos++
  }

  return pontos
}

if (senhaInput && confirmarSenhaInput) {
  senhaInput.addEventListener('input', atualizarForcaSenha)
  senhaInput.addEventListener('input', verificarConfirmacaoSenha)
  confirmarSenhaInput.addEventListener('input', verificarConfirmacaoSenha)
}

function atualizarForcaSenha() {
  const senha = senhaInput.value
  const pontos = avaliarForcaSenha(senha)

  bar1.className = 'strength-bar'
  bar2.className = 'strength-bar'
  bar3.className = 'strength-bar'

  if (senha.length === 0) {
    strengthLabel.textContent = 'Mínimo de 12 caracteres'
    return
  }

  if (senha.length < 12) {
    bar1.classList.add('fraca')
    strengthLabel.textContent = 'Senha muito curta'
    return
  }

  if (pontos <= 2) {
    bar1.classList.add('fraca')
    strengthLabel.textContent = 'Senha fraca'
  } else if (pontos <= 4) {
    bar1.classList.add('media')
    bar2.classList.add('media')
    strengthLabel.textContent = 'Senha média'
  } else {
    bar1.classList.add('forte')
    bar2.classList.add('forte')
    bar3.classList.add('forte')
    strengthLabel.textContent = 'Senha forte'
  }
}

function verificarConfirmacaoSenha() {
  const senha = senhaInput.value
  const confirmacao = confirmarSenhaInput.value

  if (confirmacao.length === 0) {
    confirmacaoLabel.textContent = ''
    return
  }

  if (senha === confirmacao) {
    confirmacaoLabel.textContent = 'Senhas iguais'
    confirmacaoLabel.className = 'strength-label password-match'
  } else {
    confirmacaoLabel.textContent = 'As senhas não coincidem'
    confirmacaoLabel.className = 'strength-label password-mismatch'
  }
}

const signupForm = document.querySelector('#signup-form')

if (signupForm) {
  signupForm.addEventListener('submit', async (evento) => {
    evento.preventDefault()

    const parametros = new URLSearchParams(window.location.search)
    const convite = parametros.get('convite')

    const nome = document.querySelector('#nome').value
    const email = document.querySelector('#email').value
    const senha = senhaInput.value
    const confirmarSenha = confirmarSenhaInput.value

    if (senha.length < 12 || senha.length > 64) {
      alert('A senha deve ter entre 12 e 64 caracteres.')
      senhaInput.focus()
      return
    }

    if (senha !== confirmarSenha) {
      showPopup('As senhas não coincidem.', 2600)
      confirmarSenhaInput.focus()
      return
    }

    const novaConta = {
      nome: nome,
      email: email,
      senha: senha,
      confirmarSenha: confirmarSenha,
      convite: convite,
    }

    const resposta = await fetch('/cadastro', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(novaConta),
    })

    const resultado = await resposta.json()

    if (resposta.ok) {
      showPopup('Conta criada com sucesso!', 2600)

      setTimeout(() => {
        window.location.href = 'index.html'
      }, 1000)
    } else {
      showPopup(resultado.erro || 'Não foi possível criar a conta.', 2600)
    }
  })
}

const btnFazerLogin = document.querySelector('#btn-fazer-login')

if (btnFazerLogin) {
  btnFazerLogin.addEventListener('click', () => {
    window.location.href = 'login.html'
    console.log('clicou')
  })
}

//-----------------------------------------------------------------

function mostrarPagina(idPagina) {
  const paginas = document.querySelectorAll('.page')
  paginas.forEach((pagina) => {
    pagina.classList.remove('active-page')
  })
  const paginaAtiva = document.getElementById(idPagina)
  if (paginaAtiva) {
    paginaAtiva.classList.add('active-page')
  }
  const btnAtivo = document.querySelectorAll('.btn-header')
  btnAtivo.forEach((btn) => {
    btn.classList.remove('btn-header-active')
  })
  const btnAtual = document.getElementById('btn-' + idPagina)
  if (btnAtual) {
    btnAtual.classList.add('btn-header-active')
  }
}

const navegacaoHeader = document.querySelector('.app-header nav')

if (navegacaoHeader) {
  navegacaoHeader.addEventListener(
    'wheel',
    (event) => {
      const maxScroll =
        navegacaoHeader.scrollWidth - navegacaoHeader.clientWidth
      const delta = event.deltaX || event.deltaY
      const novoScroll = Math.max(
        0,
        Math.min(maxScroll, navegacaoHeader.scrollLeft + delta),
      )

      if (novoScroll === navegacaoHeader.scrollLeft) {
        return
      }

      event.preventDefault()
      navegacaoHeader.scrollLeft = novoScroll
    },
    { passive: false },
  )
}

window.onload = () => mostrarPagina('dashboard')

//-----------------------------------------------------------------

const nomeUsuario = document.querySelector('#nome-usuario')
const nomeAdmin = document.querySelector('#admin-user-name')
const nomePerfil = document.querySelector('#profile-name')
const emailPerfil = document.querySelector('#profile-email')
const tipoContaPerfil = document.querySelector('#profile-role')
const statusPerfil = document.querySelector('#profile-load-status')

async function colocarNomeUser() {
  if (!nomeUsuario && !nomeAdmin && !nomePerfil) {
    return
  }

  try {
    const resposta = await fetch('/usuario-atual')

    if (!resposta.ok) {
      throw new Error('Não foi possível carregar o usuário.')
    }

    const usuario = await resposta.json()

    if (nomeUsuario) {
      nomeUsuario.textContent = usuario.nome
    }

    if (nomeAdmin) {
      nomeAdmin.textContent = usuario.nome
    }
    if (nomePerfil) {
      nomePerfil.textContent = usuario.nome
    }
    if (emailPerfil) {
      emailPerfil.textContent = usuario.email
    }
    if (tipoContaPerfil) {
      tipoContaPerfil.textContent =
        usuario.admin === 'admin' ? 'Administrador' : 'Usuário'
    }
  } catch (erro) {
    console.error('Erro ao carregar usuário:', erro)
    if (nomePerfil) {
      nomePerfil.textContent = 'Perfil indisponível'
    }
    if (statusPerfil) {
      statusPerfil.textContent =
        'Não foi possível carregar seus dados. Atualize a página e tente novamente.'
    }
  }
}

colocarNomeUser()

const botaoExcluirConta = document.querySelector('#btn-excluir-conta')
const dialogExcluirConta = document.querySelector('#delete-account-dialog')
const tituloExcluirConta = document.querySelector('#delete-account-title')
const descricaoExcluirConta = document.querySelector(
  '#delete-account-description',
)
const senhaExcluirConta = document.querySelector('#delete-account-password')
const campoSenhaExcluirConta = document.querySelector(
  '#delete-account-password-field',
)
const campoGoogleExcluirConta = document.querySelector(
  '#delete-account-google-field',
)
const botaoGoogleExcluirConta = document.querySelector(
  '#delete-account-google-button',
)
const campoCodigoExcluirConta = document.querySelector(
  '#delete-account-code-field',
)
const codigoExcluirConta = document.querySelector('#delete-account-code')
const statusExcluirConta = document.querySelector('#delete-account-status')
const botaoSolicitarCodigoExclusao = document.querySelector(
  '#delete-account-request-code',
)
const botaoConfirmarExclusao = document.querySelector('#delete-account-confirm')
const botaoCancelarExclusao = document.querySelector('#delete-account-cancel')
let metodoAutenticacaoExclusao = 'senha'
let googleExclusaoConfigurado = false
let requisicaoExclusaoEmAndamento = false

function atualizarStatusExclusao(mensagem = '') {
  if (!statusExcluirConta) {
    return
  }

  statusExcluirConta.textContent = mensagem
  statusExcluirConta.hidden = !mensagem
}

function atualizarBotoesExclusao(bloqueados) {
  if (botaoSolicitarCodigoExclusao) {
    botaoSolicitarCodigoExclusao.disabled = bloqueados
  }
  if (botaoConfirmarExclusao) {
    botaoConfirmarExclusao.disabled = bloqueados
  }
}

async function aguardarGoogleIdentity() {
  return new Promise((resolve, reject) => {
    let tentativas = 0
    const intervalo = window.setInterval(() => {
      const googleIdentity = window.google?.accounts?.id

      if (googleIdentity) {
        window.clearInterval(intervalo)
        resolve(googleIdentity)
        return
      }

      tentativas += 1
      if (tentativas >= 100) {
        window.clearInterval(intervalo)
        reject(new Error('Não foi possível carregar a confirmação do Google.'))
      }
    }, 100)
  })
}

async function prepararConfirmacaoGoogle() {
  if (!botaoGoogleExcluirConta || googleExclusaoConfigurado) {
    return
  }

  const googleIdentity = await aguardarGoogleIdentity()
  googleIdentity.initialize({
    client_id: botaoGoogleExcluirConta.dataset.clientId,
    callback: handleGoogleDeleteConfirmation,
    auto_select: false,
  })
  googleIdentity.renderButton(botaoGoogleExcluirConta, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
  })
  googleExclusaoConfigurado = true
}

function confirmarExclusaoConta() {
  if (!dialogExcluirConta) {
    return
  }

  metodoAutenticacaoExclusao =
    localStorage.getItem('metodoAutenticacao') === 'google' ? 'google' : 'senha'

  const requerSenha = metodoAutenticacaoExclusao === 'senha'
  if (campoSenhaExcluirConta && senhaExcluirConta) {
    campoSenhaExcluirConta.hidden = !requerSenha
    senhaExcluirConta.value = ''
  }
  if (campoGoogleExcluirConta) {
    campoGoogleExcluirConta.hidden = requerSenha
  }
  if (campoCodigoExcluirConta) {
    campoCodigoExcluirConta.hidden = true
  }
  if (botaoSolicitarCodigoExclusao) {
    botaoSolicitarCodigoExclusao.hidden =
      metodoAutenticacaoExclusao === 'google'
  }
  if (botaoConfirmarExclusao) {
    botaoConfirmarExclusao.hidden = true
  }
  if (codigoExcluirConta) {
    codigoExcluirConta.value = ''
  }
  if (tituloExcluirConta) {
    tituloExcluirConta.textContent = 'Tem certeza?'
  }
  if (descricaoExcluirConta) {
    descricaoExcluirConta.textContent =
      'Confirme sua identidade para receber um código de confirmação por e-mail.'
  }
  atualizarStatusExclusao()

  dialogExcluirConta.showModal()

  if (metodoAutenticacaoExclusao === 'google') {
    prepararConfirmacaoGoogle().catch((erro) => {
      console.error('Erro ao preparar confirmação do Google:', erro)
      atualizarStatusExclusao(erro.message)
    })
  }
}

async function handleGoogleDeleteConfirmation(response) {
  if (
    !response ||
    typeof response.credential !== 'string' ||
    !response.credential
  ) {
    atualizarStatusExclusao(
      'Não foi possível confirmar sua identidade com o Google. Tente novamente.',
    )
    return
  }

  if (!dialogExcluirConta?.open || metodoAutenticacaoExclusao !== 'google') {
    return
  }

  await solicitarCodigoExclusao({ credential: response.credential })
}

async function solicitarCodigoExclusao(credenciais = {}) {
  if (requisicaoExclusaoEmAndamento) {
    return
  }

  const senha = senhaExcluirConta?.value || ''
  if (metodoAutenticacaoExclusao === 'senha' && !senha) {
    atualizarStatusExclusao('Digite sua senha para confirmar sua identidade.')
    senhaExcluirConta?.focus()
    return
  }

  requisicaoExclusaoEmAndamento = true
  atualizarBotoesExclusao(true)
  atualizarStatusExclusao('Confirmando sua identidade e enviando o código...')

  try {
    const dadosIdentidade =
      metodoAutenticacaoExclusao === 'google'
        ? { credential: credenciais.credential }
        : { senha }
    const resposta = await fetch('/usuarios/excluir-conta/solicitar', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify(dadosIdentidade),
    })
    const resultado = await resposta.json()

    if (!resposta.ok) {
      throw new Error(
        resultado.erro || 'Não foi possível enviar o código de confirmação.',
      )
    }

    if (campoSenhaExcluirConta) {
      campoSenhaExcluirConta.hidden = true
    }
    if (campoGoogleExcluirConta) {
      campoGoogleExcluirConta.hidden = true
    }
    if (senhaExcluirConta) {
      senhaExcluirConta.value = ''
    }
    if (campoCodigoExcluirConta) {
      campoCodigoExcluirConta.hidden = false
    }
    if (botaoSolicitarCodigoExclusao) {
      botaoSolicitarCodigoExclusao.hidden = true
    }
    if (botaoConfirmarExclusao) {
      botaoConfirmarExclusao.hidden = false
    }
    if (tituloExcluirConta) {
      tituloExcluirConta.textContent = 'Verifique seu e-mail'
    }
    if (descricaoExcluirConta) {
      descricaoExcluirConta.textContent =
        'Digite o código de quatro dígitos enviado para o e-mail cadastrado. Ele expira em 10 minutos.'
    }

    atualizarStatusExclusao(
      resultado.mensagem || 'Código enviado. Ele expira em 10 minutos.',
    )
    codigoExcluirConta?.focus()
  } catch (erro) {
    console.error('Erro ao solicitar código de exclusão:', erro)
    atualizarStatusExclusao(
      erro.message || 'Não foi possível enviar o código de confirmação.',
    )
  } finally {
    requisicaoExclusaoEmAndamento = false
    atualizarBotoesExclusao(false)
  }
}

async function excluirConta() {
  if (requisicaoExclusaoEmAndamento) {
    return
  }

  const codigo = codigoExcluirConta?.value.trim() || ''
  if (!/^\d{4}$/.test(codigo)) {
    atualizarStatusExclusao(
      'Informe o código de quatro dígitos recebido por e-mail.',
    )
    codigoExcluirConta?.focus()
    return
  }

  requisicaoExclusaoEmAndamento = true
  atualizarBotoesExclusao(true)
  atualizarStatusExclusao('Confirmando o código e excluindo sua conta...')

  try {
    const resposta = await fetch('/usuarios/excluir-conta/confirmar', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ codigo }),
    })
    const resultado = await resposta.json()

    if (!resposta.ok) {
      throw new Error(resultado.erro || 'Não foi possível excluir a conta.')
    }

    for (const chave of [
      'usuario',
      'token',
      'authToken',
      'BolsoappData',
      'lancamentos',
      'pendencias',
      'reservas',
      'bolso_convites_temporarios',
      'metodoAutenticacao',
    ]) {
      localStorage.removeItem(chave)
    }
    sessionStorage.clear()

    window.location.href = '/login.html'
  } catch (erro) {
    console.error('Erro ao confirmar exclusão da conta:', erro)
    atualizarStatusExclusao(erro.message || 'Não foi possível excluir a conta.')
  } finally {
    requisicaoExclusaoEmAndamento = false
    atualizarBotoesExclusao(false)
  }
}

if (botaoExcluirConta) {
  botaoExcluirConta.addEventListener('click', confirmarExclusaoConta)
}

if (dialogExcluirConta) {
  dialogExcluirConta.addEventListener('close', () => {
    if (senhaExcluirConta) {
      senhaExcluirConta.value = ''
    }
    if (codigoExcluirConta) {
      codigoExcluirConta.value = ''
    }
    if (botaoExcluirConta) {
      botaoExcluirConta.focus()
    }
  })
}

if (botaoSolicitarCodigoExclusao) {
  botaoSolicitarCodigoExclusao.addEventListener('click', () =>
    solicitarCodigoExclusao(),
  )
}

if (senhaExcluirConta) {
  senhaExcluirConta.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault()
      solicitarCodigoExclusao()
    }
  })
}

if (botaoConfirmarExclusao) {
  botaoConfirmarExclusao.addEventListener('click', excluirConta)
}

if (codigoExcluirConta) {
  codigoExcluirConta.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault()
      excluirConta()
    }
  })
}

if (botaoCancelarExclusao && dialogExcluirConta) {
  botaoCancelarExclusao.addEventListener('click', () =>
    dialogExcluirConta.close('cancel'),
  )
}

//-----------------------------------------------------------------
// Convites

const CHAVE_CONVITES_STORAGE = 'bolso_convites_temporarios'
const TEMPO_LINK_STORAGE = 6 * 60 * 60 * 1000 // 6 horas

const formGerarConvite = document.getElementById('form-gerar-convite')
const resultadoConvite = document.getElementById('resultado-convite')
const inputLinkConvite = document.getElementById('input-link-convite')
const btnCopiarLink = document.getElementById('btn-copiar-link')
const tabelaConvitesBody = document.getElementById('tabela-convites-body')
const filtrosConvites = document.getElementById('filtros-convites')
const btnAbrirConvites = document.getElementById('btn-convites-abrir')

//-----------------------------------------------------------------

async function verificarUsuarioAdmin() {
  try {
    const resposta = await fetch('/usuario-atual')

    if (!resposta.ok) {
      throw new Error('Não foi possivel carregar o usuário')
    }

    const dados = await resposta.json()

    if (!btnAbrirConvites) {
      return
    }

    console.log('usuariofuncionou')

    if (dados.admin === 'admin') {
      console.log('é admin')
      btnAbrirConvites.classList.remove('button-off')
      btnAbrirConvites.classList.add('button-on')
    }
  } catch {}
}

// Armazenamento temporário dos links

function obterConvitesTemporarios() {
  const dados = localStorage.getItem(CHAVE_CONVITES_STORAGE)

  if (!dados) {
    return []
  }

  try {
    return JSON.parse(dados)
  } catch (erro) {
    console.error('Erro ao ler convites temporários:', erro)
    return []
  }
}

function salvarConviteTemporario(id, link) {
  const convites = obterConvitesTemporarios()

  const novoConvite = {
    id: id,
    link: link,
    salvoEm: Date.now(),
  }

  const convitesAtualizados = convites.filter(
    (convite) => String(convite.id) !== String(id),
  )

  convitesAtualizados.push(novoConvite)

  localStorage.setItem(
    CHAVE_CONVITES_STORAGE,
    JSON.stringify(convitesAtualizados),
  )
}

function limparConvitesTemporarios() {
  const agora = Date.now()

  const convites = obterConvitesTemporarios()

  const convitesValidos = convites.filter((convite) => {
    return agora - convite.salvoEm < TEMPO_LINK_STORAGE
  })

  localStorage.setItem(CHAVE_CONVITES_STORAGE, JSON.stringify(convitesValidos))
}

function obterLinkTemporario(id) {
  const convites = obterConvitesTemporarios()

  const convite = convites.find((convite) => String(convite.id) === String(id))

  return convite ? convite.link : null
}

// Limpa links antigos assim que a página é carregada

limparConvitesTemporarios()

//-----------------------------------------------------------------
// Gerar convite

if (formGerarConvite) {
  formGerarConvite.addEventListener('submit', async (e) => {
    e.preventDefault()

    const email = document.getElementById('input-email-convite').value.trim()

    const validade = document.getElementById('select-validade-convite').value

    try {
      const resposta = await fetch('/convites', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          email: email || null,
          validade: validade,
        }),
      })

      const resultado = await resposta.json()

      console.log('Resposta do servidor:', resultado)

      if (!resposta.ok) {
        console.error('Erro ao gerar convite:', resultado)

        alert(resultado.erro || 'Erro ao gerar convite.')

        return
      }

      if (!resultado.link) {
        console.error('Servidor não retornou o link do convite:', resultado)

        alert(
          'O convite foi criado, mas o link não foi retornado pelo servidor.',
        )

        return
      }

      // Mostra o link na tela

      inputLinkConvite.value = resultado.link

      // Salva temporariamente no navegador

      salvarConviteTemporario(resultado.id, resultado.link)

      resultadoConvite.classList.add('show')

      formGerarConvite.reset()

      // Atualiza a tabela

      await carregarConvites()

      console.log('Convite criado e link armazenado temporariamente!')
    } catch (erro) {
      console.error('Erro ao conectar com o servidor:', erro)

      alert('Não foi possível conectar ao servidor.')
    }
  })
}

//-----------------------------------------------------------------
// Copiar link do convite recém-criado

if (btnCopiarLink) {
  btnCopiarLink.addEventListener('click', async () => {
    const link = inputLinkConvite.value

    if (!link) {
      return
    }

    try {
      await navigator.clipboard.writeText(link)

      const textoOriginal = btnCopiarLink.innerText

      btnCopiarLink.innerText = 'Copiado!'

      setTimeout(() => {
        btnCopiarLink.innerText = textoOriginal
      }, 1500)
    } catch (erro) {
      console.error('Erro ao copiar convite:', erro)

      inputLinkConvite.select()

      document.execCommand('copy')
    }
  })
}

//-----------------------------------------------------------------
// Ações da tabela de convites

if (tabelaConvitesBody) {
  tabelaConvitesBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-acao')

    if (!btn || btn.disabled) {
      return
    }

    const linha = btn.closest('tr')

    if (!linha) {
      return
    }

    const conviteId = linha.dataset.conviteId
    const acao = btn.dataset.acao

    //-----------------------------------------------------------------
    // Copiar

    if (acao === 'copiar') {
      const link = obterLinkTemporario(conviteId)

      if (!link) {
        alert(
          'O link deste convite não está mais disponível neste navegador. Gere um novo convite.',
        )

        return
      }

      try {
        await navigator.clipboard.writeText(link)

        const textoOriginal = btn.innerText

        btn.innerText = 'Copiado!'

        setTimeout(() => {
          btn.innerText = textoOriginal
        }, 1500)
      } catch (erro) {
        console.error('Erro ao copiar convite:', erro)

        alert('Não foi possível copiar o convite.')
      }
    }

    //-----------------------------------------------------------------
    // Cancelar

    if (acao === 'cancelar') {
      console.log('Cancelar convite:', conviteId)
    }
  })
}

//-----------------------------------------------------------------
// Filtros

if (filtrosConvites) {
  filtrosConvites.addEventListener('click', (e) => {
    const btn = e.target.closest('.filtro-btn')

    if (!btn) {
      return
    }

    filtrosConvites.querySelectorAll('.filtro-btn').forEach((b) => {
      b.classList.remove('filtro-ativo')
    })

    btn.classList.add('filtro-ativo')

    const filtro = btn.dataset.filtro

    const linhas = document.querySelectorAll('#tabela-convites-body tr')

    linhas.forEach((linha) => {
      if (filtro === 'todos' || linha.dataset.status === filtro) {
        linha.style.display = ''
      } else {
        linha.style.display = 'none'
      }
    })
  })
}

//-----------------------------------------------------------------
// Formatação de datas

function formatarData(data) {
  if (!data) {
    return '-'
  }

  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

//-----------------------------------------------------------------
// Carregar convites

async function carregarConvites() {
  if (!tabelaConvitesBody) {
    return
  }

  try {
    const resposta = await fetch('/convites')

    const resultado = await resposta.json()

    if (!resposta.ok) {
      console.error('Erro ao carregar convites:', resultado)

      return
    }

    renderizarConvites(resultado)
  } catch (erro) {
    console.error('Erro ao conectar com o servidor:', erro)
  }
}

//-----------------------------------------------------------------
// Renderizar convites

function renderizarConvites(convites) {
  tabelaConvitesBody.innerHTML = ''

  if (convites.length === 0) {
    return
  }

  convites.forEach((convite) => {
    const linha = document.createElement('tr')

    let status
    let statusTexto

    if (convite.usado) {
      status = 'utilizado'
      statusTexto = 'Utilizado'
    } else if (new Date(convite.expira_em) <= new Date()) {
      status = 'expirado'
      statusTexto = 'Expirado'
    } else {
      status = 'disponivel'
      statusTexto = 'Disponível'
    }

    linha.dataset.conviteId = convite.id
    linha.dataset.status = status

    const email = convite.email || 'Sem e-mail vinculado'
    const linkDisponivel = obterLinkTemporario(convite.id) !== null
    const podeCopiar = status === 'disponivel' && linkDisponivel

    linha.innerHTML = `
      <td class="email-convite ${convite.email ? '' : 'sem-email'}">
        ${email}
      </td>

      <td class="data-convite">
        ${formatarData(convite.criado_em)}
      </td>

      <td class="data-convite">
        ${formatarData(convite.expira_em)}
      </td>

      <td>
        <span class="status-badge status-${status}">
          ${statusTexto}
        </span>
      </td>

      <td>
        <div class="acoes-convite">
          <button
            type="button"
            class="btn-acao btn-acao-copiar"
            data-acao="copiar"
            ${!podeCopiar ? 'disabled' : ''}
          >
            Copiar
          </button>

          <button
            type="button"
            class="btn-acao btn-acao-cancelar"
            data-acao="cancelar"
            ${status !== 'disponivel' ? 'disabled' : ''}
          >
            Cancelar
          </button>

        </div>
      </td>
    `

    tabelaConvitesBody.appendChild(linha)
  })
}

//-----------------------------------------------------------------
// Carregar tabela ao abrir a página

carregarConvites()

//-----------------------------------------------------------------

if (paginaAtual.endsWith('index.html') || paginaAtual === '/') {
  carregarCategorias()
  carregarLancamento()
  carregarBancos()
  carregarReservas()
  carregarGastosFixos()
  carregarMetas()
  verificarUsuarioAdmin()
}

function handleGoogleLogin(response) {
  if (!response || typeof response.credential !== 'string') {
    alert('Não foi possível obter a credencial do Google.')
    return
  }

  // `response.credential` é um ID token assinado pelo Google e é o valor
  // enviado para validação no servidor; o `data-client_id` do HTML identifica
  // apenas o aplicativo. Para exclusão, solicite uma credencial nova em vez de
  // confiar em um google_id enviado pelo cliente ou guardar este token antigo.
  const parametros = new URLSearchParams(window.location.search)
  const convite = parametros.get('convite')

  fetch('/api/auth/google-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      credential: response.credential,
      convite,
    }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.erro || 'Não foi possível entrar com o Google.')
      }

      localStorage.setItem('usuario', JSON.stringify(data.usuario))
      localStorage.setItem('metodoAutenticacao', 'google')

      window.location.href = '/index.html'
    })
    .catch((error) => {
      console.error('Erro no login Google:', error)
      alert('Erro no login: ' + error.message)
    })
}

function authHeaders() {
  const token = localStorage.getItem('authToken')
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}
