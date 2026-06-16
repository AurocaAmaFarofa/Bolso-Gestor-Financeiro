const btnLancamentos = document.querySelector('#new-expense')
const btnFecharPopup = document.querySelector('#close-popup')
const lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
const pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
const btnAddLancamento = document.querySelector('#btn-submit')
const btnGasto = document.querySelector('#expense-btn')
const btnRecebimento = document.querySelector('#income-btn')
const gridLancamentos = document.querySelector('#grid-expenses')
const gridGastosFixos = document.querySelector('#grid-fixed-expenses')
const cardLancamentos = document.querySelectorAll('.card-expenses')
const saldoAtual = document.querySelector('#current-balance-id')
const totalGasto = document.querySelector('#total-expenses')
const btnPendente = document.querySelector('#pending-btn')
const btnPopupGastoFixo = document.querySelector('#btn-new-pending')
const modalPopup = document.querySelector('#popup-fixed-expense')
const btnFecharGastoFixo = document.querySelector('#close-popup-fixed')
const btnAddGastoFixo = document.querySelector('#btn-submit-fixed-expense')
const gastosFixosMain = document.querySelector('#fixed-expenses-main')
let tipoSelecionado = 'despesa'
let pagoOuNaoPago = 'naoPago'

//-----------------------------------------------------------------

window.alternarStatusGastoFixo = alternarStatusGastoFixo
window.deletarGastoFixo = deletarGastoFixo
window.fecharPopupFixed = fecharPopupFixed

function alternarStatusGastoFixo(indice) {
  let pendencias = JSON.parse(localStorage.getItem('pendencias')) || []

  if (pendencias[indice].pagoOuPendente === 'naoPago') {
    pendencias[indice].pagoOuPendente = 'pago'
  } else {
    pendencias[indice].pagoOuPendente = 'naoPago'
  }

  localStorage.setItem('pendencias', JSON.stringify(pendencias))
  renderizarGridGastosFixos()
}

function fecharPopupFixed() {
  const modalPopup = document.querySelector('#popup-fixed-expense')
  if (modalPopup) {
    modalPopup.classList.add('display-none')
  }
}

function deletarGastoFixo(indice) {
  let pendencias = JSON.parse(localStorage.getItem('pendencias')) || []
  pendencias.splice(indice, 1)
  localStorage.setItem('pendencias', JSON.stringify(pendencias))
  renderizarGridGastosFixos()
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

if (btnPopupGastoFixo && modalPopup) {
  btnPopupGastoFixo.addEventListener('click', (evento) => {
    evento.stopPropagation()
    modalPopup.classList.toggle('display-none')
  })
}

if (btnFecharGastoFixo && modalPopup) {
  btnFecharGastoFixo.addEventListener('click', (evento) => {
    evento.stopPropagation()
    modalPopup.classList.add('display-none')
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
}

renderizarGridGastosFixos()

//-----------------------------------------------------------------

function renderizarGridLancamentos() {
  const lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
  gridLancamentos.innerHTML = ''
  let saldoAtualNum = 0
  let totalGastoNum = 0

  // CORREÇÃO: Usando o forEach como função e passando 'item' como parâmetro
  lancamentos.forEach((item, indice) => {
    console.log(indice)
    gridLancamentos.innerHTML += `
      <div class="card-expenses ${item.tipo === 'ganho' ? 'income-color' : 'expense-color'}">
        <h2>${item.descricao}</h2>
        <p>R$ ${item.valor}</p>
        <p>${item.categoria}</p>
        <div class="division-card">
          <p>${item.forma}</p>
          <p>${new Date(item.data).toLocaleDateString('pt-BR')}</p>
        </div>
        <button class="btn-delete" id="delete-btn-card" onclick="deletarLancamento(${indice})">Excluir</button>
      </div>
    `
    const valorItem = Number(item.valor)
    if (item.tipo === 'ganho') {
      saldoAtualNum = saldoAtualNum + valorItem
    } else {
      saldoAtualNum = saldoAtualNum - valorItem
      totalGastoNum = totalGastoNum + valorItem
    }
  })
  saldoAtual.textContent = 'R$' + saldoAtualNum.toFixed(2).replace('.', ',')
  totalGasto.textContent = 'R$' + totalGastoNum.toFixed(2).replace('.', ',')
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

function fecharPopup() {
  const popup = document.querySelector('#popup-modal')
  popup.classList.add('display-none')
  desmarcarBotao()
}

btnAddLancamento.addEventListener('click', () => {
  let lancamentos = JSON.parse(localStorage.getItem('lancamentos')) || []
  const novoLancamento = {
    tipo: tipoSelecionado,
    valor: document.getElementById('valueInput').value,
    categoria: document.getElementById('category-select').value,
    descricao: document.getElementById('descriptionInput').value,
    forma: document.getElementById('payment-select').value,
    data: Date.now(),
  }

  lancamentos.push(novoLancamento)
  localStorage.setItem('lancamentos', JSON.stringify(lancamentos))

  console.log(lancamentos)

  renderizarGridLancamentos()
  fecharPopup()
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

btnLancamentos.addEventListener('click', () => {
  const popup = document.querySelector('#popup-modal')
  popup.classList.remove('display-none')
  desmarcarBotao()
})

btnFecharPopup.addEventListener('click', () => {
  const popup = document.querySelector('#popup-modal')
  popup.classList.add('display-none')
  desmarcarBotao()
})
