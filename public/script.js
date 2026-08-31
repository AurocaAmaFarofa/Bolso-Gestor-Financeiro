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

function adicionarNovaCategoria() {
  const inputNome = document.getElementById('new-category-name')

  if (!inputNome) {
    return
  }

  const nomeCategoria = inputNome.value.trim()

  if (nomeCategoria === '') return

  const novaCategoria = {
    id: 'cat-' + Date.now(),
    nome: nomeCategoria.toLowerCase(),
  }

  appData.categoriasGasto.push(novaCategoria)
  salvarDados()
  renderizarCategoriasDeGasto()

  inputNome.value = ''
  abrirOuFecharPopup('popup-nova-categoria', 'fechar')
}

function renderizarCategoriasDeGasto() {
  const htmlCategoriaMeta = document.getElementById('category-select-goals')
  const htmlCategoria = document.getElementById('category-select')

  if (!htmlCategoriaMeta || !htmlCategoria) {
    return
  }

  htmlCategoriaMeta.innerHTML = ''
  htmlCategoria.innerHTML = ''

  appData.categoriasGasto.forEach((gasto) => {
    const nomeFormatado = primeiraLetraMaior(gasto.nome)

    htmlCategoria.innerHTML += `
            <option value="${gasto.nome}">${nomeFormatado}</option>
        `

    htmlCategoriaMeta.innerHTML += `
            <option value="${gasto.nome}">${nomeFormatado}</option>
        `
  })
}

renderizarCategoriasDeGasto()

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

  if (status === 'fechado') {
    const copiaLancamentos = appData.lancamentos.slice()
    const arrayLançamentos = copiaLancamentos.reverse()
    const primeirosLan = arrayLançamentos.slice(0, 3)
    gridUltimosGastos.innerHTML = ''
    primeirosLan.forEach((item) => {
      gridUltimosGastos.innerHTML += `
        <div class="card-expenses cards-last">
          <h1 class="card-text-last">${item.descricao}</h1>
          <h1 class="card-text-last">${item.valor}</h1>
          <h1 class="card-text-last">${item.tipo}</h1>
        </div>
      `
    })
    status = 'aberto'
  } else {
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

if (btnCriarMeta) {
  btnCriarMeta.addEventListener('click', () => {
    const nomeMeta = document.getElementById('category-select-goals').value
    const valorMeta = document.getElementById('new-goals-input-value').value

    if (!nomeMeta) {
      showPopup('Por favor, digite o nome da meta.', 2200)
      return
    }
    if (Number(valorMeta) < 0) {
      showPopup('Por favor, insira um número válido.', 2200)
      return
    }

    const novaMeta = {
      mesCriado: appData.mesAtivo,
      nome: nomeMeta,
      valorMax: valorMeta,
    }

    appData.metas.push(novaMeta)
    salvarDados()

    document.getElementById('category-select-goals').value = ''
    document.getElementById('new-goals-input-value').value = ''

    atualizarTudo()
  })
}

function renderizarDoisVisores() {
  if (!visorExMeta || !visorMainMeta) {
    return
  }

  visorExMeta.innerHTML = ``
  visorMainMeta.innerHTML = ``

  console.log('Visor Principal:', visorMainMeta)
  console.log('Visor Lançamentos:', visorExMeta)

  if (appData.metas) {
    appData.metas.forEach((item, indice) => {
      if (item.mesCriado !== appData.mesAtivo) {
        return
      }

      const gastosDaCategoria = appData.lancamentos.filter((lancamentos) => {
        return (
          lancamentos.mesAno === appData.mesAtivo &&
          lancamentos.categoria === item.nome &&
          lancamentos.tipo === 'despesa'
        )
      })

      const totalGastoMeta = gastosDaCategoria.reduce((soma, lancamento) => {
        return soma + Number(lancamento.valor)
      }, 0)

      console.log(gastosDaCategoria)
      console.log(totalGastoMeta)

      const matematicaDaBarra = (totalGastoMeta / item.valorMax) * 100
      const stringPorcentagem = matematicaDaBarra + '%'

      const nomeMeta = item.nome
      const nomeFormatado = primeiraLetraMaior(nomeMeta)

      let cardMeta = `
        <div class="current-balance card-meta-${indice}">
          <div class="header-meta-card">
            <h1>Gasto com ${nomeFormatado}</h1>
            <button class="btn-delete" onclick="deletarMeta(${indice})">x</button>
          </div>
          <div class="progress-goal-container">
            <div class="progress-goal-${indice} progress-goal"></div>
          </div>
        </div>
      `

      visorExMeta.innerHTML += cardMeta
      visorMainMeta.innerHTML += cardMeta

      const cardAtual = document.querySelectorAll(`.card-meta-${indice}`)
      const barraProgresso = document.querySelectorAll(
        `.progress-goal-${indice}`,
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

      let classeAlerta = ''
    })
  }
}

function deletarMeta(indice) {
  if (appData.metas) {
    appData.metas.splice(indice, 1)
    salvarDados()
    atualizarTudo()
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
}

// ============ função pra pegar os itens do MySql =====//

async function carregarLancamento() {
  const resposta = await fetch('/lancamentos')
  const lancamentos = await resposta.json()
  appData.lancamentos = lancamentos
  console.log('Lançamentos do banco: ', lancamentos)
  atualizarTudo()
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
      headers: {
        'Content-Type': 'application/json',
      },
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
  const resposta = await fetch('/bancos')
  const bancos = await resposta.json()

  appData.bancos = bancos

  if (appData.bancos.length === 0) {
    await criarBancoInicial()
  }

  if (!appData.bancoAtual) {
    selecionarBanco(appData.bancos[0].id)
  }

  console.log('Bancos do banco de dados: ', bancos)

  atualizarTudo()
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
    headers: {
      'Content-Type': 'application/json',
    },
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
  const resposta = await fetch('/reservas')
  const reservas = await resposta.json()

  appData.reservas = reservas

  atualizarTudo()
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
      headers: {
        'Content-Type': 'application/json',
      },
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
  btnAdicionarValorReserva.addEventListener('click', () => {
    if (indiceReservaSelecionada === null) return
    const valorPraRetirar = Number(
      document.querySelector('#plus-value-reserve').value,
    )
    appData.reservas[indiceReservaSelecionada].valorI += valorPraRetirar
    salvarDados()
    atualizarTudo()
    abrirOuFecharPopup('modal-add', 'fechar')
    document.querySelector('#plus-value-reserve').value = ''
    indiceReservaSelecionada = null
  })
}

//RETIRAR O VALOR DA RESERVA USANDO INDICE
if (btnTirarValor) {
  btnTirarValor.addEventListener('click', () => {
    if (indiceReservaSelecionada === null) return
    const valorPraAdicionar = Number(
      document.querySelector('#minus-value-reserve').value,
    )
    appData.reservas[indiceReservaSelecionada].valorI -= valorPraAdicionar
    salvarDados()
    atualizarTudo()
    abrirOuFecharPopup('modal-minus', 'fechar')
    document.querySelector('#minus-value-reserve').value = ''
    indiceReservaSelecionada = null
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

  //CRIA O INDICE PRA USAR NA HORA DE TROCAR OS VALORES
  appData.reservas.forEach((item, indice) => {
    gridReservas.innerHTML += `
      <div class="card-expenses">
        <div class="especifications">
          <h2>${item.nome}</h2>
          <p>R$ ${Number(item.valor).toFixed(2).replace('.', ',')}</p>
        </div>
        <div class="btns-delete-plus-minus">
          <div class="change-btns half">
            <button class="btn-plus-minus" id="plus-btn" onclick="abrirOuFecharPopup('modal-add', 'abrir', ${indice})">+</button>
            <button class="btn-plus-minus" id="minus-btn" onclick="abrirOuFecharPopup('modal-minus', 'abrir', ${indice})">-</button>
          </div>
          <button class="btn-delete half" onclick="excluirReservas(${indice})">Excluir</button>
        </div>
      </div>
    `
    //MUDA NA PAGINA DE INICIO
    valorTotalReservado += Number(item.valor)
    ;(totalReservadoVisor.textContent =
      'R$' + valorTotalReservado.toFixed(2)).replace('.', ',')
  })
}

//FUNÇÃO PARA EXCLUIR A RESERVA
function excluirReservas(indice) {
  appData.reservas.splice(indice, 1)
  salvarDados()
  atualizarTudo()
}

atualizarTudo()

//----------------------Coisas dos Gastos Fixos-------------------------

window.alternarStatusGastoFixo = alternarStatusGastoFixo
window.deletarGastoFixo = deletarGastoFixo

function alternarStatusGastoFixo(indice) {
  if (appData.pendencias[indice].pagoOuPendente === 'naoPago') {
    appData.pendencias[indice].pagoOuPendente = 'pago'
  } else {
    appData.pendencias[indice].pagoOuPendente = 'naoPago'
  }

  salvarDados()
  atualizarTudo()
}

function deletarGastoFixo(indice) {
  appData.pendencias.splice(indice, 1)
  salvarDados()
  atualizarTudo()
}

function renderizarGridGastosFixos() {
  const pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
  if (!gridGastosFixos || !gastosFixosMain) return

  gastosFixosMain.innerHTML = ''
  gridGastosFixos.innerHTML = ''

  appData.pendencias.forEach((item, indice) => {
    const ehPago = item.pagoOuPendente === 'pago'
    const classeStatus = ehPago ? 'pago' : 'pending'
    const textoBotao = ehPago ? 'Pago' : 'Pendente'

    gridGastosFixos.innerHTML += `
    <div class="card-expenses">
      <div class="especifications">
        <h2>${item.nome}</h2>
        <p>R$ ${item.valor}</p>
      </div>
      <div class="btns-new-expenses">
        <button class="change-btn ${classeStatus}" onclick="alternarStatusGastoFixo(${indice})">
          ${textoBotao}
        </button>
        <button class="btn-delete" onclick="deletarGastoFixo(${indice})">Excluir</button>
      </div>
    </div>
    `
    gastosFixosMain.innerHTML += `
    <div class="fixed-card-main">
      <h1 class="title-fixed-main">${item.nome}</h1>
      <p class="pending-type-main">${textoBotao}</p>
    </div>
    `
  })
}

if (btnAddGastoFixo) {
  btnAddGastoFixo.addEventListener('click', () => {
    const novaPendencia = {
      pagoOuPendente: 'naoPago',
      valor: document.getElementById('fixed-expense-value').value,
      nome: document.getElementById('fixed-expense-name').value,
    }

    if (!novaPendencia.nome || !novaPendencia.valor) {
      showPopup('Preencha nome e valor do gasto fixo.', 2200)
      return
    }

    appData.pendencias.push(novaPendencia)
    salvarDados()
    abrirOuFecharPopup('popup-fixed-expense', 'fechar')

    document.getElementById('fixed-expense-value').value = ''
    document.getElementById('fixed-expense-name').value = ''

    atualizarTudo()
  })
}

//-----------------------------------------------------------------

function renderizarGridLancamentos() {
  if (gridLancamentos) gridLancamentos.innerHTML = ''
  const idProcurado = appData.bancoAtual
  const bancoObjeto = appData.bancos.find((b) => b.id === idProcurado)
  let saldoBancoSelecionadoNum = 0
  if (bancoObjeto) {
    if (bancoObjeto.mesCriado === appData.mesAtivo) {
      saldoBancoSelecionadoNum = Number(bancoObjeto.saldoInicial)
    }
  }
  let totalTodosBancosNum = appData.bancos.reduce((soma, b) => {
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

renderizarGridLancamentos()

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
        categoria: document.getElementById('category-select').value,
        descricao: document.getElementById('descriptionInput').value,
        forma: document.getElementById('payment-select').value,
        data: dataLancamento,
        mesAno: mesAnoDoLancamento,
        bancoId: appData.bancoAtual,
      }

      if (novoLancamento.tipo === 'despesa') {
        const metaEncontrada = appData.metas.find(
          (metas) =>
            metas.nome === novoLancamento.categoria &&
            metas.mesCriado === appData.mesAtivo,
        )

        if (metaEncontrada) {
          const gastosDaCategoria = appData.lancamentos.filter(
            (lancamentos) => {
              return (
                lancamentos.mesAno === appData.mesAtivo &&
                lancamentos.categoria === metaEncontrada.nome &&
                lancamentos.tipo === 'despesa'
              )
            },
          )

          const totalGasto = gastosDaCategoria.reduce((soma, lancamento) => {
            return soma + Number(lancamento.valor)
          }, 0)

          gastoComInput = totalGasto + novoLancamento.valor

          if (gastoComInput > metaEncontrada.valorMax) {
            let resposta = confirm('Valor irá exeder a meta, deseja continuar?')
            if (resposta === false) {
              return
            }
          }
        }
      }

      const resposta = await fetch('/lancamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

const btnCriarContaLogin = document.querySelector('#btn-criar-conta')

if (btnCriarContaLogin) {
  btnCriarContaLogin.addEventListener('click', () => {
    window.location.href = 'cadastro.html'
  })
}

async function confirmarLogout(callback) {
  const desejaSair = window.confirm('Deseja realmente sair?')

  if (!desejaSair) {
    return
  }

  const resposta = await fetch('/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (resposta.ok) {
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(novaConta),
    })

    if (resposta.ok) {
      window.location.href = 'index.html'
    } else {
      showPopup('E-mail ou senha inválidos.', 2600)
    }
  })
}

//cadastro

const signupForm = document.querySelector('#signup-form')

if (signupForm) {
  signupForm.addEventListener('submit', async (evento) => {
    evento.preventDefault()

    const nome = document.querySelector('#nome').value
    const email = document.querySelector('#email').value
    const senha = document.querySelector('#senha').value
    const confirmarSenha = document.querySelector('#confirmar-senha').value

    if (senha !== confirmarSenha) {
      showPopup('As senhas não coincidem.', 2600)
      return
    }

    const novaConta = {
      nome: nome,
      email: email,
      senha: senha,
    }

    const resposta = await fetch('/cadastro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(novaConta),
    })

    const resultado = await resposta.json()

    if (resposta.ok) {
      showPopup('Conta criada com sucesso!', 2600)

      setTimeout(() => {
        window.location.href = 'login.html'
      }, 1000)
    } else {
      showPopup(resultado.erro || 'Não foi possível criar a conta.', 2600)
    }
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

window.onload = () => mostrarPagina('dashboard')

//-----------------------------------------------------------------

if (paginaAtual.endsWith('index.html') || paginaAtual === '/') {
  carregarLancamento()
  carregarBancos()
  carregarReservas()
}
