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
let valorTotalReservado = 0
let indiceReservaSelecionada = null //INDICE PRA MUDAR VALOR NA RESERVA
let tipoSelecionado = 'despesa' //TIPO DE LANÇAMENTO
let pagoOuNaoPago = 'naoPago' //MUDAR O ESTADO DO GASTO FIXO

const appData = JSON.parse(localStorage.getItem('appDados')) || []

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
}

//============== BANCOS PARA SELECIOAR ===============//

let bancos = JSON.parse(localStorage.getItem('bancos')) || []
if (bancos.length === 0) {
  bancos = [{ id: 'banco-inicial', nome: 'Banco Inicial', saldoInicial: 0 }]
  localStorage.setItem('bancos', JSON.stringify(bancos))
}
let bancoAtual = localStorage.getItem('bancoAtual') || bancos[0].id //DEIXA O BANCO SEM SELECIONAR NO INICIO

function renderizarAbasBancos() {
  if (!listBancosAbas) return
  listBancosAbas.innerHTML = ''

  bancos.forEach((banco, indice) => {
    const classeAtiva = banco.id === bancoAtual ? 'banco-active' : ''

    listBancosAbas.innerHTML += `
    <div class="btns-aba-bancos">
      <button class="btn-aba-banco ${classeAtiva}" onclick="selecionarBanco('${banco.id}')">
        ${banco.nome}
        <button class="btn-aba-banco color-red-btn ${classeAtiva}" onclick="excluirBanco(${indice})">-</button>
      </button>
    </div>  
    `
  })
}

window.selecionarBanco = function (id) {
  bancoAtual = id
  localStorage.setItem('bancoAtual', id)
  atualizarTudo()
}

btnSubmitBanco.addEventListener('click', () => {
  const inputNome = document.querySelector('#banco-name')
  const inputSaldo = document.querySelector('#banco-saldo-inicial')

  if (!inputNome.value) {
    alert('Por favor, digite o nome do banco.')
    return
  }

  const novoBanco = {
    id: 'banco-' + Date.now(),
    nome: inputNome.value,
    saldoInicial: Number(inputSaldo.value) || 0,
  }

  localStorage.setItem('appData', JSON.stringify(appData))
  console.log(appData)

  bancos.push(novoBanco)

  localStorage.setItem('bancos', JSON.stringify(bancos))

  inputNome.value = ''
  inputSaldo.value = ''
  modalPopupBanco.classList.add('display-none')

  atualizarTudo()
})

function excluirBanco(indice) {
  bancos.splice(indice, 1)
  localStorage.setItem('bancos', JSON.stringify(bancos))
  if (bancos.length > 0) {
    bancoAtual = bancos[0].id
    localStorage.setItem('bancoAtual', bancoAtual)
  }
  atualizarTudo()
}

renderizarAbasBancos()

//----------------------Coisas Das Reservas----------------------

//BOTAO PRA ADICIONAR NOVA RESERVA
btnAddReserva.addEventListener('click', () => {
  let reservas = JSON.parse(localStorage.getItem('reservas')) || []
  const novaReserva = {
    nome: document.querySelector('#reserve-name').value,
    valorI: Number(document.querySelector('#reserve-value').value),
  }
  reservas.push(novaReserva)
  console.log(reservas)
  localStorage.setItem('reservas', JSON.stringify(reservas))

  document.querySelector('#reserve-name').value = ''
  document.querySelector('#reserve-value').value = ''

  atualizarTudo()
  abrirOuFecharPopup('popup-reserve', 'fechar')
})

// ADICIONAR VALOR PRA RESERVA USANDO INDICE
btnAdicionarValorReserva.addEventListener('click', () => {
  if (indiceReservaSelecionada === null) return
  let reservas = JSON.parse(localStorage.getItem('reservas')) || []
  const valorPraRetirar = Number(
    document.querySelector('#plus-value-reserve').value,
  )
  reservas[indiceReservaSelecionada].valorI += valorPraRetirar
  localStorage.setItem('reservas', JSON.stringify(reservas))
  atualizarTudo()
  abrirOuFecharPopup('modal-add', 'fechar')
  document.querySelector('#plus-value-reserve').value = ''
  indiceReservaSelecionada = null
})

//RETIRAR O VALOR DA RESERVA USANDO INDICE
btnTirarValor.addEventListener('click', () => {
  if (indiceReservaSelecionada === null) return
  let reservas = JSON.parse(localStorage.getItem('reservas')) || []
  const valorPraAdicionar = Number(
    document.querySelector('#minus-value-reserve').value,
  )
  reservas[indiceReservaSelecionada].valorI -= valorPraAdicionar
  localStorage.setItem('reservas', JSON.stringify(reservas))
  atualizarTudo()
  abrirOuFecharPopup('modal-minus', 'fechar')
  document.querySelector('#minus-value-reserve').value = ''
  indiceReservaSelecionada = null
})

//MOSTRA NA PAGINA AS RESERVAS
function renderizarGridReservas() {
  const reservas = JSON.parse(localStorage.getItem('reservas')) || []
  valorTotalReservado = 0
  gridReservas.innerHTML = ''

  //CRIA O INDICE PRA USAR NA HORA DE TROCAR OS VALORES
  reservas.forEach((item, indice) => {
    gridReservas.innerHTML += `
      <div class="card-expenses">
        <div class="especifications">
          <h2>${item.nome}</h2>
          <p>R$ ${item.valorI.toFixed(2).replace('.', ',')}</p>
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
    valorTotalReservado += Number(item.valorI)
    ;(totalReservadoVisor.textContent =
      'R$' + valorTotalReservado.toFixed(2)).replace('.', ',')
  })
}

//FUNÇÃO PARA EXCLUIR A RESERVA
function excluirReservas(indice) {
  let reservas = JSON.parse(localStorage.getItem('reservas')) || []
  reservas.splice(indice, 1)
  localStorage.setItem('reservas', JSON.stringify(reservas))
  atualizarTudo()
}

atualizarTudo()

//----------------------Coisas dos Gastos Fixos-------------------------

window.alternarStatusGastoFixo = alternarStatusGastoFixo
window.deletarGastoFixo = deletarGastoFixo

function alternarStatusGastoFixo(indice) {
  let pendencias = JSON.parse(localStorage.getItem('pendencias')) || []

  if (pendencias[indice].pagoOuPendente === 'naoPago') {
    pendencias[indice].pagoOuPendente = 'pago'
  } else {
    pendencias[indice].pagoOuPendente = 'naoPago'
  }

  localStorage.setItem('pendencias', JSON.stringify(pendencias))
  atualizarTudo()
}

function deletarGastoFixo(indice) {
  let pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
  pendencias.splice(indice, 1)
  localStorage.setItem('pendencias', JSON.stringify(pendencias))
  atualizarTudo()
}

function renderizarGridGastosFixos() {
  const pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
  if (!gridGastosFixos) return

  gastosFixosMain.innerHTML = ''
  gridGastosFixos.innerHTML = ''

  pendencias.forEach((item, indice) => {
    const ehPago = item.pagoOuPendente === 'pago'
    const classeStatus = ehPago ? 'pago' : 'pending'
    const textoBotao = ehPago ? 'Pago' : 'Pendente'

    console.log(indice + 'fixos')
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
    let pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
    const novaPendencia = {
      pagoOuPendente: 'naoPago',
      valor: document.getElementById('fixed-expense-value').value,
      nome: document.getElementById('fixed-expense-name').value,
    }

    pendencias.push(novaPendencia)
    localStorage.setItem('pendencias', JSON.stringify(pendencias))
    fecharPopupFixed()
    console.log(pendencias)
    renderizarGridGastosFixos()

    document.getElementById('fixed-expense-value').value = ''
    document.getElementById('fixed-expense-name').value = ''
  })
  atualizarTudo()
}

//-----------------------------------------------------------------

function renderizarGridLancamentos() {
  const lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
  if (gridLancamentos) gridLancamentos.innerHTML = ''
  const idProcurado = bancoAtual
  const bancoObjeto = bancos.find((b) => b.id === idProcurado)
  let saldoBancoSelecionadoNum = bancoObjeto
    ? Number(bancoObjeto.saldoInicial)
    : 0

  let totalTodosBancosNum = bancos.reduce(
    (soma, b) => soma + Number(b.saldoInicial),
    0,
  )
  let totalGastoNum = 0

  lancamentos.forEach((item, indice) => {
    const valorItem = Number(item.valor)
    if (item.tipo === 'ganho') {
      totalTodosBancosNum += valorItem
    } else {
      totalTodosBancosNum -= valorItem
    }

    if (item.bancoId !== bancoAtual) return

    if (item.tipo === 'ganho') {
      saldoBancoSelecionadoNum += valorItem
    } else {
      saldoBancoSelecionadoNum -= valorItem
      totalGastoNum += valorItem
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
          <button class="btn-delete" id="delete-btn-card" onclick="deletarLancamento(${indice})">Excluir</button>
        </div>
      `
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

function deletarLancamento(indice) {
  let lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
  lancamentos.splice(indice, 1)
  localStorage.setItem('lancamentos', JSON.stringify(lancamentos))
  renderizarGridLancamentos()
}

//deixa o botao sem o visual de selecionado
function desmarcarBotao() {
  btnGasto.classList.remove('btn-selected-ex')
  btnRecebimento.classList.remove('btn-selected-in')
}

//seleciona o tipo pra gasto
btnGasto.addEventListener('click', () => {
  btnRecebimento.classList.remove('btn-selected-in')
  btnGasto.classList.add('btn-selected-ex')
  tipoSelecionado = 'despesa'
})

//seleciona o tipo pra ganho
btnRecebimento.addEventListener('click', () => {
  console.log('mudou')
  btnGasto.classList.remove('btn-selected-ex')
  btnRecebimento.classList.add('btn-selected-in')
  tipoSelecionado = 'ganho'
})

btnAddLancamento.addEventListener('click', () => {
  let lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
  const inputData = document.getElementById('dateInput').value
  const dataLancamento = inputData ? new Date(inputData).getTime() : Date.now()
  const novoLancamento = {
    tipo: tipoSelecionado,
    valor: document.getElementById('valueInput').value,
    categoria: document.getElementById('category-select').value,
    descricao: document.getElementById('descriptionInput').value,
    forma: document.getElementById('payment-select').value,
    data: dataLancamento,
    bancoId: bancoAtual,
  }

  lancamentos.push(novoLancamento)
  localStorage.setItem('lancamentos', JSON.stringify(lancamentos))

  console.log(lancamentos)

  atualizarTudo()
  abrirOuFecharPopup('popup-modal', 'fechar')

  document.getElementById('valueInput').value = ''
  document.getElementById('category-select').value = ''
  document.getElementById('descriptionInput').value = ''
  document.getElementById('payment-select').value = ''
  tipoSelecionado = 'despesa'
})

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
