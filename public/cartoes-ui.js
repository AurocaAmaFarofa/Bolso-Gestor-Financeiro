// =====================================================================
// Cartões de crédito e faturas
//
// Regra principal (para não cobrar duas vezes):
//  - Compra no crédito = lançamento com forma 'credito' + cartaoId.
//    Conta como gasto no mês da compra, mas NÃO sai do saldo da conta.
//  - Pagamento da fatura = registro em fatura_pagamentos.
//    Não conta como gasto, mas sai do saldo da conta na data do pagamento.
//
// Usa do script.js: appData, moedaBRL, escaparHtml, showPopup, authHeaders,
// obterDataLancamento, atualizarTudo, tipoSelecionado, corDoBanco, pintarCartao,
// abrirOuFecharPopup, mostrarPagina.
// =====================================================================

;(() => {
  if (!document.getElementById('cards')) return

  appData.cartoes = Array.isArray(appData.cartoes) ? appData.cartoes : []
  appData.faturaPagamentos = Array.isArray(appData.faturaPagamentos) ? appData.faturaPagamentos : []

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor)
  const brl = (valor) => moedaBRL.format(Number(valor) || 0)
  const esc = (texto) => escaparHtml(String(texto ?? ''))
  const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

  let cartaoAbertoId = null
  let faturaSelecionada = null
  let cartaoEmEdicao = null
  let pagamentoAlvo = null

  // ------------------------------------------------------------------
  // Datas
  // ------------------------------------------------------------------

  const doisDigitos = (n) => String(n).padStart(2, '0')

  function hojeIso() {
    return new Date().toLocaleDateString('en-CA')
  }

  function paraIso(data) {
    return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`
  }

  function dataBr(iso) {
    const [ano, mes, dia] = iso.split('-')
    return `${dia}/${mes}/${ano}`
  }

  function diaMesBr(iso) {
    const [, mes, dia] = iso.split('-')
    return `${dia}/${mes}`
  }

  function nomeMes(chave) {
    const [ano, mes] = chave.split('-').map(Number)
    return `${NOMES_MESES[mes - 1]} de ${ano}`
  }

  function mesCurto(chave) {
    const [ano, mes] = chave.split('-').map(Number)
    return `${NOMES_MESES[mes - 1].slice(0, 3)}/${String(ano).slice(2)}`
  }

  function somarMeses(ano, mes, quantidade) {
    const indice = ano * 12 + (mes - 1) + quantidade
    return [Math.floor(indice / 12), (indice % 12) + 1]
  }

  // Dia fixo do mês; se o mês não tiver esse dia (ex.: 31 em fevereiro), usa o último.
  function dataNoMes(ano, mes, dia) {
    const ultimo = new Date(ano, mes, 0).getDate()
    return `${ano}-${doisDigitos(mes)}-${doisDigitos(Math.min(dia, ultimo))}`
  }

  // ------------------------------------------------------------------
  // Regras da fatura
  // ------------------------------------------------------------------

  // Fatura identificada pelo mês do vencimento ('YYYY-MM').
  function datasDaFatura(chave, cartao) {
    const [ano, mes] = chave.split('-').map(Number)
    const fechamento = Number(cartao.dia_fechamento)
    const vencimentoDia = Number(cartao.dia_vencimento)
    // Se vence depois do dia de fechamento, fecha no mesmo mês; senão, no mês anterior.
    const [anoFech, mesFech] = vencimentoDia > fechamento ? [ano, mes] : somarMeses(ano, mes, -1)
    const [anoFechAnt, mesFechAnt] = somarMeses(anoFech, mesFech, -1)
    return {
      vencimento: dataNoMes(ano, mes, vencimentoDia),
      fechamento: dataNoMes(anoFech, mesFech, fechamento),
      inicio: dataNoMes(anoFechAnt, mesFechAnt, fechamento),
    }
  }

  // Compra feita a partir do dia do fechamento cai na fatura seguinte.
  function chaveDaCompra(dataIso, cartao) {
    const [ano, mes] = dataIso.split('-').map(Number)
    const fechamento = Number(cartao.dia_fechamento)
    const vencimentoDia = Number(cartao.dia_vencimento)
    const fechamentoDesteMes = dataNoMes(ano, mes, fechamento)
    const [anoFech, mesFech] = dataIso < fechamentoDesteMes ? [ano, mes] : somarMeses(ano, mes, 1)
    const [anoVenc, mesVenc] = vencimentoDia > fechamento ? [anoFech, mesFech] : somarMeses(anoFech, mesFech, 1)
    return `${anoVenc}-${doisDigitos(mesVenc)}`
  }

  function dataDoLancamento(lancamento) {
    const data = obterDataLancamento(lancamento.data)
    return Number.isNaN(data.getTime()) ? null : paraIso(data)
  }

  function comprasDoCartao(cartaoId) {
    return appData.lancamentos.filter(
      (item) =>
        item.forma === 'credito' &&
        Number(item.cartaoId) === Number(cartaoId) &&
        item.tipo !== 'ganho',
    )
  }

  /**
   * Faturas de um cartão. Com `ateMes` ('YYYY-MM'), considera só compras e
   * pagamentos feitos até o fim desse mês (usado para a reserva do mês exibido).
   */
  function calcularFaturas(cartao, ateMes = null) {
    const hoje = hojeIso()
    const faturas = new Map()

    function obter(chave) {
      if (!faturas.has(chave)) {
        faturas.set(chave, { chave, ...datasDaFatura(chave, cartao), compras: [], pagamentos: [], total: 0, pago: 0 })
      }
      return faturas.get(chave)
    }

    comprasDoCartao(cartao.id).forEach((compra) => {
      const data = dataDoLancamento(compra)
      if (!data || (ateMes && data.slice(0, 7) > ateMes)) return
      const fatura = obter(chaveDaCompra(data, cartao))
      fatura.compras.push({ ...compra, dataIso: data })
      fatura.total += Number(compra.valor) || 0
    })

    appData.faturaPagamentos
      .filter((pagamento) => Number(pagamento.cartaoId) === Number(cartao.id))
      .forEach((pagamento) => {
        if (ateMes && pagamento.data.slice(0, 7) > ateMes) return
        const fatura = obter(pagamento.fatura_mes)
        fatura.pagamentos.push(pagamento)
        fatura.pago += Number(pagamento.valor) || 0
      })

    // A fatura que está aberta hoje sempre aparece, mesmo vazia.
    if (!ateMes) obter(chaveDaCompra(hoje, cartao))

    return [...faturas.values()]
      .map((fatura) => {
        const total = Math.round(fatura.total * 100) / 100
        const pago = Math.round(fatura.pago * 100) / 100
        const pendente = Math.max(0, Math.round((total - pago) * 100) / 100)
        let status
        if (total > 0 && pendente === 0) status = 'paga'
        else if (total === 0) status = hoje >= fatura.fechamento ? 'sem-gastos' : 'aberta'
        else if (hoje > fatura.vencimento) status = 'atrasada'
        else if (hoje >= fatura.fechamento) status = 'fechada'
        else status = 'aberta'

        fatura.compras.sort((a, b) => (a.dataIso < b.dataIso ? 1 : a.dataIso > b.dataIso ? -1 : b.id - a.id))
        return { ...fatura, total, pago, pendente, status, parcial: pago > 0 && pendente > 0 }
      })
      .sort((a, b) => (a.chave < b.chave ? -1 : 1))
  }

  const ROTULO_STATUS = {
    aberta: 'Aberta',
    fechada: 'Fechada',
    paga: 'Paga',
    atrasada: 'Atrasada',
    'sem-gastos': 'Sem gastos',
  }

  function chipStatus(fatura) {
    const rotulo = fatura.parcial && fatura.status !== 'paga' ? `${ROTULO_STATUS[fatura.status]} · parcial` : ROTULO_STATUS[fatura.status]
    return `<span class="fatura-status fatura-status--${fatura.status}">${esc(rotulo)}</span>`
  }

  // Fatura que merece destaque: a mais antiga ainda devendo; senão, a aberta de hoje.
  function faturaEmDestaque(faturas, cartao) {
    const devendo = faturas.find((fatura) => fatura.pendente > 0 && fatura.status !== 'aberta')
    if (devendo) return devendo
    const chaveAtual = chaveDaCompra(hojeIso(), cartao)
    return faturas.find((fatura) => fatura.chave === chaveAtual) || faturas[faturas.length - 1]
  }

  function bancoDoCartao(cartao) {
    return appData.bancos.find((banco) => Number(banco.id) === Number(cartao.bancoId)) || null
  }

  // ------------------------------------------------------------------
  // Reserva opcional (usada por renderizarGridReservas no script.js)
  // ------------------------------------------------------------------

  window.obterReservasDeFatura = function obterReservasDeFatura() {
    const mesAtivo = typeof normalizarMes === 'function' ? normalizarMes(appData.mesAtivo) : appData.mesAtivo
    const reservas = []

    appData.cartoes
      .filter((cartao) => cartao.reservar_fatura)
      .forEach((cartao) => {
        calcularFaturas(cartao, mesAtivo)
          .filter((fatura) => fatura.pendente > 0)
          .forEach((fatura) => {
            reservas.push({
              cartaoId: cartao.id,
              titulo: `Fatura ${cartao.nome}`,
              descricao: `Vence ${dataBr(fatura.vencimento)} · reservado até você pagar`,
              valor: fatura.pendente,
            })
          })
      })

    return reservas
  }

  // ------------------------------------------------------------------
  // Campo "Cartão" no formulário de novo lançamento
  // ------------------------------------------------------------------

  const campoCartao = $('#card-select-field')
  const selectCartao = $('#card-select')
  const dicaCartao = $('#card-select-hint')
  const selectForma = $('#payment-select')
  const inputData = $('#dateInput')

  function atualizarCampoCartao() {
    if (!campoCartao || !selectCartao || !selectForma) return
    const forma = selectForma.value
    const ehGasto = typeof tipoSelecionado === 'undefined' || tipoSelecionado === 'despesa'
    const mostrar = ehGasto && ['credito', 'debito'].includes(forma) && appData.cartoes.length > 0

    campoCartao.hidden = !mostrar
    if (!mostrar) return

    const anterior = selectCartao.value
    const opcoes = appData.cartoes.map((cartao) => `<option value="${cartao.id}">${esc(cartao.nome)}</option>`).join('')
    selectCartao.innerHTML =
      forma === 'credito'
        ? `${opcoes}<option value="">Sem cartão cadastrado (sai da conta agora)</option>`
        : `<option value="">Não vincular a um cartão</option>${opcoes}`

    if ([...selectCartao.options].some((opcao) => opcao.value === anterior)) {
      selectCartao.value = anterior
    }

    const cartao = appData.cartoes.find((item) => String(item.id) === selectCartao.value)
    if (!cartao) {
      dicaCartao.textContent =
        forma === 'credito' ? 'Sem cartão, o valor sai da conta selecionada na data do lançamento.' : ''
      return
    }

    const banco = bancoDoCartao(cartao)
    if (forma === 'credito') {
      const data = inputData?.value || hojeIso()
      const { vencimento } = datasDaFatura(chaveDaCompra(data, cartao), cartao)
      dicaCartao.textContent = `Entra na fatura que vence em ${dataBr(vencimento)}. Só sai da conta${banco ? ` ${banco.nome}` : ''} quando você marcar a fatura como paga.`
    } else {
      dicaCartao.textContent = `Sai agora da conta${banco ? ` ${banco.nome}` : ''}.`
    }
  }

  window.atualizarCampoCartao = atualizarCampoCartao

  window.obterCartaoDoFormulario = function obterCartaoDoFormulario(tipo) {
    if (tipo !== 'despesa' || !campoCartao || campoCartao.hidden) return null
    return selectCartao.value ? Number(selectCartao.value) : null
  }

  selectForma?.addEventListener('change', atualizarCampoCartao)
  selectCartao?.addEventListener('change', atualizarCampoCartao)
  inputData?.addEventListener('change', atualizarCampoCartao)
  $('#expense-btn')?.addEventListener('click', atualizarCampoCartao)
  $('#income-btn')?.addEventListener('click', atualizarCampoCartao)

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------

  async function api(caminho, opcoes = {}) {
    const resposta = await fetch(caminho, {
      method: opcoes.method || 'GET',
      headers: authHeaders(),
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    })
    if (resposta.status === 401) {
      window.location.href = 'login.html'
      throw new Error('Sessão expirada.')
    }
    const json = await resposta.json().catch(() => ({}))
    if (!resposta.ok) throw new Error(json.erro || 'Não foi possível concluir a operação.')
    return json
  }

  async function carregarCartoes() {
    try {
      const dados = await api('/cartoes')
      appData.cartoes = dados.cartoes
      appData.faturaPagamentos = dados.pagamentos
      atualizarTudo()
    } catch (erro) {
      console.error('Erro ao carregar cartões:', erro)
      const grid = $('#cards-grid')
      if (grid) grid.innerHTML = `<p class="grid-none-expenses data-empty-state">${esc(erro.message)}</p>`
    }
  }

  // ------------------------------------------------------------------
  // Página de cartões
  // ------------------------------------------------------------------

  function htmlLimite(cartao, usado) {
    if (!cartao.limite) return `<span class="cartao-limite-texto">Usado ${brl(usado)}</span>`
    const percentual = Math.min(100, (usado / cartao.limite) * 100)
    return `
      <div class="cartao-limite">
        <div class="cartao-limite-texto"><span>Limite usado ${brl(usado)}</span><span>Disponível ${brl(Math.max(0, cartao.limite - usado))}</span></div>
        <div class="cartao-limite-barra" role="img" aria-label="${percentual.toFixed(0)} por cento do limite usado"><span style="width:${percentual}%"></span></div>
      </div>`
  }

  function renderizarCartoes() {
    const grid = $('#cards-grid')
    if (!grid) return

    atualizarCampoCartao()

    if (appData.cartoes.length === 0) {
      grid.innerHTML =
        '<p class="grid-none-expenses data-empty-state">Cadastre seu primeiro cartão para lançar compras no crédito e acompanhar as faturas.</p>'
    } else {
      grid.innerHTML = appData.cartoes
        .map((cartao) => {
          const faturas = calcularFaturas(cartao)
          const destaque = faturaEmDestaque(faturas, cartao)
          const usado = faturas.reduce((soma, fatura) => soma + fatura.pendente, 0)
          const banco = bancoDoCartao(cartao)
          return `
            <article class="cartao-item">
              <button type="button" class="cartao-visual" data-cartao-abrir="${cartao.id}" data-cor="${esc(corDoBanco(banco))}" aria-label="Abrir faturas de ${esc(cartao.nome)}">
                <span class="cartao-visual-topo">
                  <strong>${esc(cartao.nome)}</strong>
                  ${cartao.reservar_fatura ? '<span class="cartao-tag">Reservando</span>' : ''}
                </span>
                <span class="bank-card-chip" aria-hidden="true"></span>
                <span class="cartao-visual-fatura">
                  <small>Fatura de ${esc(nomeMes(destaque.chave))}</small>
                  <strong>${brl(destaque.pendente || destaque.total)}</strong>
                </span>
                <span class="cartao-visual-rodape">
                  <span>Fecha dia ${cartao.dia_fechamento} · vence dia ${cartao.dia_vencimento}</span>
                  <span>${esc(banco ? banco.nome : 'Conta removida')}</span>
                </span>
              </button>
              <div class="cartao-resumo">
                <div class="cartao-resumo-linha">
                  ${chipStatus(destaque)}
                  <span>Vence ${dataBr(destaque.vencimento)}</span>
                </div>
                ${htmlLimite(cartao, usado)}
                <div class="cartao-acoes">
                  ${destaque.pendente > 0 ? `<button type="button" class="btn-new-expenses" data-cartao-pagar="${cartao.id}" data-fatura="${destaque.chave}">Marcar como paga</button>` : ''}
                  <button type="button" class="inv-botao-secundario" data-cartao-abrir="${cartao.id}">Ver faturas</button>
                </div>
              </div>
            </article>`
        })
        .join('')

      grid.querySelectorAll('.cartao-visual[data-cor]').forEach((elemento) => pintarCartao(elemento, elemento.dataset.cor))
    }

    if (cartaoAbertoId && $('#card-dialog-detalhe').open) renderizarDetalhe()
  }

  window.renderizarCartoes = renderizarCartoes

  // ------------------------------------------------------------------
  // Detalhe do cartão (faturas)
  // ------------------------------------------------------------------

  function renderizarDetalhe() {
    const cartao = appData.cartoes.find((item) => Number(item.id) === Number(cartaoAbertoId))
    if (!cartao) {
      fecharDialogo($('#card-dialog-detalhe'))
      return
    }

    const faturas = calcularFaturas(cartao)
    if (!faturas.some((fatura) => fatura.chave === faturaSelecionada)) {
      faturaSelecionada = faturaEmDestaque(faturas, cartao).chave
    }
    const fatura = faturas.find((item) => item.chave === faturaSelecionada)
    const banco = bancoDoCartao(cartao)
    const nomesBancos = new Map(appData.bancos.map((item) => [Number(item.id), item.nome]))

    $('#card-detalhe-conta').textContent = `PAGO PELA CONTA ${banco ? banco.nome.toUpperCase() : '—'}`
    $('#card-detalhe-nome').textContent = cartao.nome

    $('#card-detalhe-conteudo').innerHTML = `
      <div class="inv-acoes">
        <button type="button" class="btn-new-expenses" data-cartao-lancar="${cartao.id}">Lançar compra</button>
        <button type="button" class="inv-botao-secundario" data-cartao-editar="${cartao.id}">Editar cartão</button>
        <button type="button" class="inv-botao-perigo" data-cartao-excluir="${cartao.id}">Excluir</button>
      </div>

      <div class="fatura-abas" role="tablist" aria-label="Faturas">
        ${faturas
          .map(
            (item) => `<button type="button" role="tab" aria-selected="${item.chave === faturaSelecionada}" data-fatura-aba="${item.chave}" class="fatura-aba fatura-aba--${item.status}">
              <span>${esc(mesCurto(item.chave))}</span>
              <strong>${brl(item.total)}</strong>
            </button>`,
          )
          .join('')}
      </div>

      <section class="fatura-cabecalho">
        <div>
          <span class="section-kicker">FATURA DE ${esc(nomeMes(fatura.chave).toUpperCase())}</span>
          <div class="fatura-cabecalho-linha">${chipStatus(fatura)}<span>Vence ${dataBr(fatura.vencimento)}</span></div>
          <small class="inv-dica">Compras de ${dataBr(fatura.inicio)} até ${dataBr(somarDiasIso(fatura.fechamento, -1))} · fecha ${diaMesBr(fatura.fechamento)}</small>
        </div>
        ${
          fatura.pendente > 0
            ? `<button type="button" class="btn-new-expenses" data-cartao-pagar="${cartao.id}" data-fatura="${fatura.chave}">Marcar como paga</button>`
            : ''
        }
      </section>

      <dl class="inv-resumo-grade">
        <div class="inv-resumo-item inv-forte"><dt>Total da fatura</dt><dd>${brl(fatura.total)}</dd></div>
        <div class="inv-resumo-item"><dt>Já pago</dt><dd>${brl(fatura.pago)}</dd></div>
        <div class="inv-resumo-item ${fatura.pendente > 0 ? 'inv-negativo' : ''}"><dt>Falta pagar</dt><dd>${brl(fatura.pendente)}</dd></div>
      </dl>

      <section class="inv-bloco">
        <h3>Compras (${fatura.compras.length})</h3>
        ${
          fatura.compras.length === 0
            ? '<p class="inv-dica">Nenhuma compra nesta fatura.</p>'
            : `<ul class="inv-lista">${fatura.compras
                .map(
                  (compra) => `<li>
                    <span class="inv-lista-texto">
                      <strong>${esc(compra.descricao || 'Sem descrição')}</strong>
                      <small>${dataBr(compra.dataIso)} · ${esc(compra.categoria || 'Sem categoria')}</small>
                    </span>
                    <strong>${brl(compra.valor)}</strong>
                  </li>`,
                )
                .join('')}</ul>`
        }
      </section>

      ${
        fatura.pagamentos.length
          ? `<section class="inv-bloco">
              <h3>Pagamentos</h3>
              <ul class="inv-lista">${fatura.pagamentos
                .map(
                  (pagamento) => `<li>
                    <span class="inv-lista-icone inv-saida" aria-hidden="true">−</span>
                    <span class="inv-lista-texto">
                      <strong>Pago em ${dataBr(pagamento.data)}</strong>
                      <small>Saiu da conta ${esc(nomesBancos.get(Number(pagamento.bancoId)) || '—')}</small>
                    </span>
                    <strong>${brl(pagamento.valor)}</strong>
                    <button type="button" class="inv-botao-icone" data-pagamento-excluir="${pagamento.id}" aria-label="Excluir pagamento de ${dataBr(pagamento.data)}">
                      <svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-trash"></use></svg>
                    </button>
                  </li>`,
                )
                .join('')}</ul>
            </section>`
          : ''
      }
    `
  }

  function somarDiasIso(iso, dias) {
    const [ano, mes, dia] = iso.split('-').map(Number)
    return paraIso(new Date(ano, mes - 1, dia + dias))
  }

  // ------------------------------------------------------------------
  // Diálogos
  // ------------------------------------------------------------------

  function abrirDialogo(dialogo) {
    if (!dialogo.open) dialogo.showModal()
  }

  function fecharDialogo(dialogo) {
    if (dialogo?.open) dialogo.close()
  }

  ;['#card-dialog-detalhe', '#card-dialog-form', '#card-dialog-pagamento'].forEach((id) => {
    const dialogo = $(id)
    dialogo?.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-fechar]') || evento.target === dialogo) fecharDialogo(dialogo)
    })
  })

  function mostrarErro(form, mensagem) {
    const erro = $('.inv-form-erro', form)
    erro.textContent = mensagem || ''
    erro.hidden = !mensagem
  }

  function opcoesDeContas(selecionada) {
    return appData.bancos
      .map(
        (banco) =>
          `<option value="${banco.id}" ${Number(banco.id) === Number(selecionada) ? 'selected' : ''}>${esc(banco.nome)}</option>`,
      )
      .join('')
  }

  async function enviar(form, executar) {
    const botao = $('button[type="submit"]', form)
    mostrarErro(form, '')
    botao.disabled = true
    try {
      await executar()
    } catch (erro) {
      mostrarErro(form, erro.message)
    } finally {
      botao.disabled = false
    }
  }

  // ----- Novo / editar cartão -----

  const formCartao = $('#card-form')

  function atualizarExemploDias() {
    const fechamento = Number(formCartao.elements.dia_fechamento.value)
    const vencimento = Number(formCartao.elements.dia_vencimento.value)
    const exemplo = $('#card-form-exemplo')
    if (!(fechamento >= 1 && fechamento <= 31 && vencimento >= 1 && vencimento <= 31)) {
      exemplo.textContent = 'Compras feitas a partir do dia do fechamento entram na fatura do mês seguinte.'
      return
    }
    const cartao = { dia_fechamento: fechamento, dia_vencimento: vencimento }
    const hoje = hojeIso()
    const { vencimento: proximo, fechamento: fecha } = datasDaFatura(chaveDaCompra(hoje, cartao), cartao)
    exemplo.textContent = `Uma compra hoje entra na fatura que fecha em ${dataBr(fecha)} e vence em ${dataBr(proximo)}. A partir do dia ${fechamento}, as compras passam para a fatura do mês seguinte.`
  }

  formCartao.elements.dia_fechamento.addEventListener('input', atualizarExemploDias)
  formCartao.elements.dia_vencimento.addEventListener('input', atualizarExemploDias)

  function abrirFormCartao(cartao = null) {
    if (appData.bancos.length === 0) {
      showPopup('Crie uma conta antes de cadastrar um cartão.', 2600)
      return
    }
    cartaoEmEdicao = cartao ? Number(cartao.id) : null
    formCartao.reset()
    mostrarErro(formCartao, '')
    formCartao.elements.bancoId.innerHTML = opcoesDeContas(cartao ? cartao.bancoId : appData.bancoAtual)
    $('#card-form-titulo').textContent = cartao ? 'Editar cartão' : 'Novo cartão'

    if (cartao) {
      formCartao.elements.nome.value = cartao.nome
      formCartao.elements.dia_fechamento.value = cartao.dia_fechamento
      formCartao.elements.dia_vencimento.value = cartao.dia_vencimento
      formCartao.elements.limite.value = cartao.limite ?? ''
      formCartao.elements.reservar_fatura.checked = cartao.reservar_fatura
    }

    atualizarExemploDias()
    abrirDialogo($('#card-dialog-form'))
    formCartao.elements.nome.focus()
  }

  formCartao.addEventListener('submit', (evento) => {
    evento.preventDefault()
    const campos = formCartao.elements
    const corpo = {
      nome: campos.nome.value.trim(),
      bancoId: Number(campos.bancoId.value),
      dia_fechamento: Number(campos.dia_fechamento.value),
      dia_vencimento: Number(campos.dia_vencimento.value),
      limite: campos.limite.value ? Number(campos.limite.value) : null,
      reservar_fatura: campos.reservar_fatura.checked,
    }

    if (!corpo.nome) return mostrarErro(formCartao, 'Dê um nome para o cartão.')
    if (!(corpo.dia_fechamento >= 1 && corpo.dia_fechamento <= 31)) return mostrarErro(formCartao, 'Dia de fechamento entre 1 e 31.')
    if (!(corpo.dia_vencimento >= 1 && corpo.dia_vencimento <= 31)) return mostrarErro(formCartao, 'Dia de vencimento entre 1 e 31.')

    enviar(formCartao, async () => {
      if (cartaoEmEdicao) {
        await api(`/cartoes/${cartaoEmEdicao}`, { method: 'PATCH', corpo })
        showPopup('Cartão atualizado.')
      } else {
        await api('/cartoes', { method: 'POST', corpo })
        showPopup('Cartão criado.')
      }
      fecharDialogo($('#card-dialog-form'))
      // A conta das compras pode ter mudado: recarrega lançamentos também.
      if (cartaoEmEdicao && typeof carregarLancamento === 'function') await carregarLancamento()
      await carregarCartoes()
    })
  })

  // ----- Pagamento de fatura -----

  const formPagamento = $('#card-form-pagamento')

  function abrirPagamento(cartaoId, chave) {
    const cartao = appData.cartoes.find((item) => Number(item.id) === Number(cartaoId))
    if (!cartao) return
    const fatura = calcularFaturas(cartao).find((item) => item.chave === chave)
    if (!fatura) return

    pagamentoAlvo = { cartaoId: cartao.id, chave }
    formPagamento.reset()
    mostrarErro(formPagamento, '')
    $('#card-pagamento-fatura').textContent = `${cartao.nome} · fatura de ${nomeMes(chave)}`.toUpperCase()
    formPagamento.elements.valor.value = fatura.pendente.toFixed(2)
    formPagamento.elements.data.value = hojeIso()
    formPagamento.elements.data.max = hojeIso()
    formPagamento.elements.bancoId.innerHTML = opcoesDeContas(cartao.bancoId)
    abrirDialogo($('#card-dialog-pagamento'))
  }

  formPagamento.addEventListener('submit', (evento) => {
    evento.preventDefault()
    const campos = formPagamento.elements
    const corpo = {
      fatura_mes: pagamentoAlvo.chave,
      valor: Number(campos.valor.value),
      data: campos.data.value,
      bancoId: Number(campos.bancoId.value),
    }
    if (!(corpo.valor > 0)) return mostrarErro(formPagamento, 'Informe o valor pago.')
    if (!corpo.data) return mostrarErro(formPagamento, 'Informe a data do pagamento.')

    enviar(formPagamento, async () => {
      await api(`/cartoes/${pagamentoAlvo.cartaoId}/pagamentos`, { method: 'POST', corpo })
      fecharDialogo($('#card-dialog-pagamento'))
      showPopup(`Pagamento de ${brl(corpo.valor)} registrado.`)
      await carregarCartoes()
    })
  })

  // ----- Exclusões -----

  async function excluirCartao(id) {
    const cartao = appData.cartoes.find((item) => Number(item.id) === Number(id))
    if (!cartao) return
    const compras = comprasDoCartao(id).length
    const aviso = compras
      ? `\n\n${compras} compra(s) no crédito deste cartão também serão excluídas, junto com os pagamentos de fatura.`
      : ''
    if (!confirm(`Excluir o cartão "${cartao.nome}"?${aviso}`)) return

    try {
      await api(`/cartoes/${id}`, { method: 'DELETE' })
      fecharDialogo($('#card-dialog-detalhe'))
      showPopup('Cartão excluído.')
      if (typeof carregarLancamento === 'function') await carregarLancamento()
      await carregarCartoes()
    } catch (erro) {
      showPopup(erro.message, 3500)
    }
  }

  async function excluirPagamento(pagamentoId) {
    const pagamento = appData.faturaPagamentos.find((item) => Number(item.id) === Number(pagamentoId))
    if (!pagamento) return
    if (!confirm(`Excluir o pagamento de ${brl(pagamento.valor)}? O valor volta para a conta e a fatura fica pendente de novo.`)) return

    try {
      await api(`/cartoes/${pagamento.cartaoId}/pagamentos/${pagamento.id}`, { method: 'DELETE' })
      showPopup('Pagamento excluído.')
      await carregarCartoes()
    } catch (erro) {
      showPopup(erro.message, 3500)
    }
  }

  function lancarCompra(cartaoId) {
    fecharDialogo($('#card-dialog-detalhe'))
    abrirOuFecharPopup('popup-modal', 'abrir')
    $('#expense-btn')?.click()
    selectForma.value = 'credito'
    atualizarCampoCartao()
    selectCartao.value = String(cartaoId)
    atualizarCampoCartao()
  }

  function abrirCartao(id) {
    cartaoAbertoId = Number(id)
    faturaSelecionada = null
    if (typeof mostrarPagina === 'function') mostrarPagina('cards')
    renderizarDetalhe()
    abrirDialogo($('#card-dialog-detalhe'))
  }

  window.abrirCartao = abrirCartao

  // ----- Ações (delegação) -----

  document.addEventListener('click', (evento) => {
    const alvo = evento.target.closest(
      '[data-cartao-abrir],[data-cartao-pagar],[data-cartao-editar],[data-cartao-excluir],[data-cartao-lancar],[data-fatura-aba],[data-pagamento-excluir]',
    )
    if (!alvo) return
    const d = alvo.dataset

    if (d.cartaoPagar) abrirPagamento(d.cartaoPagar, d.fatura)
    else if (d.cartaoAbrir) abrirCartao(d.cartaoAbrir)
    else if (d.cartaoEditar) abrirFormCartao(appData.cartoes.find((item) => Number(item.id) === Number(d.cartaoEditar)))
    else if (d.cartaoExcluir) excluirCartao(d.cartaoExcluir)
    else if (d.cartaoLancar) lancarCompra(d.cartaoLancar)
    else if (d.pagamentoExcluir) excluirPagamento(d.pagamentoExcluir)
    else if (d.faturaAba) {
      faturaSelecionada = d.faturaAba
      renderizarDetalhe()
    }
  })

  $('#card-btn-novo')?.addEventListener('click', () => abrirFormCartao())

  renderizarCartoes()
  carregarCartoes()
})()
