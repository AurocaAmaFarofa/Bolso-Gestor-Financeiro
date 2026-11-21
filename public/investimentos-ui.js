// =====================================================================
// Investimentos (caixinhas atreladas ao CDI)
// Usa do script.js: moedaBRL, escaparHtml, showPopup, appData,
// estadoVazioGrafico e carregarLancamento.
// =====================================================================

;(() => {
  const pagina = document.getElementById('investments')
  if (!pagina) return

  const estado = {
    dados: null,
    carregando: false,
    detalheId: null,
    movimentoTipo: 'aporte',
    movimentoCaixinhaId: null,
    edicaoId: null,
    grafico: {
      carteira: { periodo: 'mes', metrica: 'rendimento' },
      detalhe: { periodo: 'mes', metrica: 'rendimento' },
    },
  }

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor)
  const brl = (valor) => moedaBRL.format(Number(valor) || 0)
  const esc = (texto) => escaparHtml(String(texto ?? ''))
  const porcentagem = (valor, casas = 2) =>
    `${(Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

  const NOMES_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

  function hojeLocal() {
    return new Date().toLocaleDateString('en-CA')
  }

  function dataBr(iso) {
    if (!iso) return '—'
    const [ano, mes, dia] = iso.split('-')
    return `${dia}/${mes}/${ano}`
  }

  function rotuloMes(chave) {
    const [ano, mes] = chave.split('-')
    return `${NOMES_MESES[Number(mes) - 1]}/${ano.slice(2)}`
  }

  function sinal(valor) {
    const numero = Number(valor) || 0
    return `${numero > 0 ? '+' : ''}${brl(numero)}`
  }

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------

  async function api(caminho, opcoes = {}) {
    const resposta = await fetch(caminho, {
      ...opcoes,
      headers: typeof authHeaders === 'function' ? authHeaders() : { 'Content-Type': 'application/json' },
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

  async function carregar() {
    if (estado.carregando) return
    estado.carregando = true
    try {
      estado.dados = await api('/investimentos')
      renderizarPagina()
      if (estado.detalheId && $('#inv-dialog-detalhe').open) renderizarDetalhe()
    } catch (erro) {
      console.error('Erro ao carregar investimentos:', erro)
      $('#inv-grid').innerHTML = `<p class="grid-none-expenses data-empty-state">${esc(erro.message)}</p>`
    } finally {
      estado.carregando = false
    }
  }

  function caixinhaPorId(id) {
    return estado.dados?.caixinhas.find((item) => item.id === Number(id)) || null
  }

  // ------------------------------------------------------------------
  // Séries: dia / mês / ano
  // ------------------------------------------------------------------

  function agregarSerie(serie, periodo, metrica) {
    if (!serie || serie.length === 0) return []

    if (periodo === 'dia') {
      const pontos =
        metrica === 'rendimento'
          ? serie.filter((ponto) => Math.abs(ponto.rendimento) > 0.0000001)
          : serie
      return pontos.slice(-30).map((ponto) => ({
        chave: ponto.data,
        label: `${ponto.data.slice(8, 10)}/${ponto.data.slice(5, 7)}`,
        titulo: dataBr(ponto.data),
        valor: metrica === 'rendimento' ? ponto.rendimento : ponto.saldo,
      }))
    }

    const tamanho = periodo === 'mes' ? 7 : 4
    const grupos = new Map()
    serie.forEach((ponto) => {
      const chave = ponto.data.slice(0, tamanho)
      const grupo = grupos.get(chave) || { rendimento: 0, saldo: 0 }
      grupo.rendimento += ponto.rendimento
      grupo.saldo = ponto.saldo // último dia do período
      grupos.set(chave, grupo)
    })

    const lista = [...grupos.entries()].map(([chave, grupo]) => ({
      chave,
      label: periodo === 'mes' ? rotuloMes(chave) : chave,
      titulo: periodo === 'mes' ? rotuloMes(chave) : chave,
      valor: metrica === 'rendimento' ? grupo.rendimento : grupo.saldo,
    }))

    return periodo === 'mes' ? lista.slice(-12) : lista
  }

  function rendimentosRecentes(serie) {
    const hoje = estado.dados?.dataReferencia || hojeLocal()
    const mes = hoje.slice(0, 7)
    const ano = hoje.slice(0, 4)
    let ultimoDia = null
    let noMes = 0
    let noAno = 0

    ;(serie || []).forEach((ponto) => {
      if (ponto.data.startsWith(mes)) noMes += ponto.rendimento
      if (ponto.data.startsWith(ano)) noAno += ponto.rendimento
      if (Math.abs(ponto.rendimento) > 0.0000001) ultimoDia = ponto
    })

    return { ultimoDia, noMes, noAno }
  }

  // ------------------------------------------------------------------
  // Gráfico em linha (SVG, no mesmo estilo dos gráficos do app)
  // ------------------------------------------------------------------

  function renderizarGrafico(elemento, serie, { periodo, metrica }) {
    if (!elemento) return
    const pontos = agregarSerie(serie, periodo, metrica)

    if (pontos.length === 0) {
      elemento.innerHTML = estadoVazioGrafico('Registre um aporte para ver a evolução.')
      return
    }

    const largura = 720
    const altura = 240
    const margem = { topo: 18, direita: 18, baixo: 34, esquerda: 78 }
    const areaLargura = largura - margem.esquerda - margem.direita
    const areaAltura = altura - margem.topo - margem.baixo
    const valores = pontos.map((ponto) => ponto.valor)
    let minimo = Math.min(...valores)
    let maximo = Math.max(...valores)

    if (metrica === 'rendimento') {
      minimo = Math.min(0, minimo)
      maximo = Math.max(0, maximo)
    } else {
      const folga = (maximo - minimo) * 0.1 || maximo * 0.02 || 1
      minimo = Math.max(0, minimo - folga)
      maximo += folga
    }
    const intervalo = maximo - minimo || 1

    const coordenadas = pontos.map((ponto, indice) => ({
      ...ponto,
      x:
        margem.esquerda +
        (pontos.length === 1 ? areaLargura / 2 : (areaLargura * indice) / (pontos.length - 1)),
      y: margem.topo + ((maximo - ponto.valor) / intervalo) * areaAltura,
    }))

    const casas = metrica === 'rendimento' && periodo === 'dia' ? 4 : 2
    const formatar = (valor) =>
      `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`

    let grade = ''
    for (let linha = 0; linha <= 4; linha += 1) {
      const y = margem.topo + (areaAltura / 4) * linha
      const valor = maximo - (intervalo / 4) * linha
      grade += `<line class="chart-grid-line" x1="${margem.esquerda}" y1="${y}" x2="${largura - margem.direita}" y2="${y}"/>`
      grade += `<text class="chart-axis-label" x="${margem.esquerda - 10}" y="${y + 4}" text-anchor="end">${esc(formatar(valor))}</text>`
    }

    const passoRotulo = Math.max(1, Math.ceil(pontos.length / 8))
    const caminho = coordenadas.map((ponto, i) => `${i === 0 ? 'M' : 'L'} ${ponto.x} ${ponto.y}`).join(' ')
    const base = margem.topo + areaAltura
    const area = `${caminho} L ${coordenadas[coordenadas.length - 1].x} ${base} L ${coordenadas[0].x} ${base} Z`
    const raio = pontos.length > 20 ? 2.5 : 4

    const marcadores = coordenadas
      .map((ponto, i) => {
        const ultimo = coordenadas.length - 1
        const rotulo =
          i === ultimo || (i % passoRotulo === 0 && ultimo - i >= passoRotulo)
            ? `<text class="chart-month-label" x="${ponto.x}" y="${altura - 9}" text-anchor="middle">${esc(ponto.label)}</text>`
            : ''
        return `<circle class="chart-point" cx="${ponto.x}" cy="${ponto.y}" r="${raio}"><title>${esc(`${ponto.titulo}: ${formatar(ponto.valor)}`)}</title></circle>${rotulo}`
      })
      .join('')

    const descricao = `${metrica === 'rendimento' ? 'Rendimento' : 'Saldo bruto'} por ${periodo}`
    elemento.innerHTML = `<svg class="financial-chart" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${esc(descricao)}">${grade}<path class="inv-chart-area" d="${area}"/><path class="chart-line" d="${caminho}"/>${marcadores}</svg>`
  }

  function atualizarControles(alvo) {
    const config = estado.grafico[alvo]
    document.querySelectorAll(`.inv-segmentado[data-alvo="${alvo}"]`).forEach((grupo) => {
      grupo.querySelectorAll('button').forEach((botao) => {
        botao.setAttribute('aria-pressed', String(botao.dataset.valor === config[grupo.dataset.grupo]))
      })
    })
  }

  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.inv-segmentado[data-alvo] button')
    if (!botao) return
    const grupo = botao.closest('.inv-segmentado')
    estado.grafico[grupo.dataset.alvo][grupo.dataset.grupo] = botao.dataset.valor
    atualizarControles(grupo.dataset.alvo)
    if (grupo.dataset.alvo === 'carteira') renderizarGraficoCarteira()
    else renderizarGraficoDetalhe()
  })

  function renderizarGraficoCarteira() {
    renderizarGrafico($('#inv-grafico'), estado.dados?.carteira.serie, estado.grafico.carteira)
  }

  function renderizarGraficoDetalhe() {
    const caixinha = caixinhaPorId(estado.detalheId)
    if (caixinha) renderizarGrafico($('#inv-detalhe-grafico'), caixinha.calculo.serie, estado.grafico.detalhe)
  }

  // ------------------------------------------------------------------
  // Página principal
  // ------------------------------------------------------------------

  function renderizarDonos(elemento, porDono) {
    const lista = (porDono || []).filter((item) => item.saldoBruto > 0)
    if (lista.length === 0) {
      elemento.innerHTML = '<p class="inv-dica">Sem saldo no momento.</p>'
      return
    }
    const total = lista.reduce((soma, item) => soma + item.saldoBruto, 0)
    elemento.innerHTML = lista
      .map((item) => {
        const parte = total > 0 ? (item.saldoBruto / total) * 100 : 0
        return `
          <div class="inv-dono">
            <div class="inv-dono-topo">
              <strong>${esc(item.dono)}</strong>
              <span>${porcentagem(parte, 1)}</span>
            </div>
            <div class="reserve-goal-progress" role="img" aria-label="${esc(item.dono)}: ${porcentagem(parte, 1)} do saldo"><span style="width:${parte}%"></span></div>
            <dl class="inv-dono-numeros">
              <div><dt>Investido</dt><dd>${brl(item.investido)}</dd></div>
              <div><dt>Saldo bruto</dt><dd>${brl(item.saldoBruto)}</dd></div>
              <div><dt>Rendeu</dt><dd class="inv-positivo">${sinal(item.rendimentoBruto)}</dd></div>
              <div><dt>Líquido</dt><dd>${brl(item.saldoLiquido)}</dd></div>
            </dl>
          </div>`
      })
      .join('')
  }

  function renderizarPagina() {
    const { carteira, caixinhas, cdi, donos } = estado.dados

    $('#inv-cdi-info').textContent = cdi.taxaAnual
      ? `CDI ${porcentagem(cdi.taxaAnual)} ao ano · atualizado em ${dataBr(cdi.ultimaData)} (Banco Central)`
      : 'CDI indisponível no momento'

    const avisos = [cdi.aviso]
    if (carteira.usouEstimativa) {
      avisos.push('Os últimos dias usam o CDI estimado até o Banco Central publicar a taxa oficial.')
    }
    const aviso = $('#inv-aviso')
    aviso.textContent = avisos.filter(Boolean).join(' ')
    aviso.hidden = !aviso.textContent

    $('#inv-total-bruto').textContent = brl(carteira.saldoBruto)
    $('#inv-total-liquido').textContent = `Líquido ${brl(carteira.saldoLiquido)}`
    $('#inv-total-investido').textContent = brl(carteira.investido)
    $('#inv-total-rendimento').textContent = sinal(carteira.rendimentoBruto)
    $('#inv-total-impostos').textContent = `IR + IOF ${brl(carteira.ir + carteira.iof)}`

    const recentes = rendimentosRecentes(carteira.serie)
    $('#inv-rendeu-dia').textContent = recentes.ultimoDia ? sinal(recentes.ultimoDia.rendimento) : brl(0)
    $('#inv-rendeu-dia').title = recentes.ultimoDia ? dataBr(recentes.ultimoDia.data) : ''
    $('#inv-rendeu-mes').textContent = sinal(recentes.noMes)
    $('#inv-rendeu-ano').textContent = sinal(recentes.noAno)

    renderizarGraficoCarteira()

    const painelDonos = $('#inv-donos-painel')
    painelDonos.hidden = carteira.porDono.length < 2
    if (!painelDonos.hidden) renderizarDonos($('#inv-donos'), carteira.porDono)

    $('#inv-lista-donos').innerHTML = [...new Set(['Eu', ...donos])]
      .map((dono) => `<option value="${esc(dono)}"></option>`)
      .join('')

    const grid = $('#inv-grid')
    if (caixinhas.length === 0) {
      grid.innerHTML =
        '<p class="grid-none-expenses data-empty-state">Crie sua primeira caixinha para acompanhar quanto ela rende.</p>'
      return
    }

    grid.innerHTML = caixinhas
      .map((caixinha) => {
        const { resumo, porDono } = caixinha.calculo
        const donosTexto =
          porDono.filter((item) => item.saldoBruto > 0).length > 1
            ? `<span class="inv-card-donos">${porDono
                .filter((item) => item.saldoBruto > 0)
                .map((item) => `${esc(item.dono)} ${brl(item.saldoBruto)}`)
                .join(' · ')}</span>`
            : ''
        return `
          <article class="card-expenses inv-card">
            <button type="button" class="inv-card-abrir" data-abrir="${caixinha.id}" aria-label="Ver detalhes de ${esc(caixinha.nome)}">
              <span class="inv-card-topo">
                <span class="inv-chip">${esc(caixinha.tipo)} · ${porcentagem(caixinha.percentual_cdi, caixinha.percentual_cdi % 1 ? 1 : 0)} do CDI</span>
                <span class="inv-chip inv-chip-suave">${esc(caixinha.liquidez)}</span>
              </span>
              <strong class="inv-card-nome">${esc(caixinha.nome)}</strong>
              <span class="inv-card-linha"><span>Saldo bruto</span><strong>${brl(resumo.saldoBruto)}</strong></span>
              <span class="inv-card-linha"><span>Rendimento bruto</span><strong class="inv-positivo">${sinal(resumo.rendimentoBruto)}</strong></span>
              ${donosTexto}
            </button>
            <div class="inv-card-acoes">
              <button type="button" class="btn-plus-minus" data-aportar="${caixinha.id}" aria-label="Aportar em ${esc(caixinha.nome)}">+</button>
              <button type="button" class="btn-plus-minus" data-resgatar="${caixinha.id}" aria-label="Resgatar de ${esc(caixinha.nome)}">-</button>
              <button type="button" class="inv-botao-texto" data-abrir="${caixinha.id}">Ver detalhes</button>
            </div>
          </article>`
      })
      .join('')
  }

  // ------------------------------------------------------------------
  // Detalhe da caixinha
  // ------------------------------------------------------------------

  function linhaResumo(rotulo, valor, classe = '', dica = '') {
    return `<div class="inv-resumo-item ${classe}"><dt>${esc(rotulo)}${dica ? ` <small>${esc(dica)}</small>` : ''}</dt><dd>${valor}</dd></div>`
  }

  function renderizarDetalhe() {
    const caixinha = caixinhaPorId(estado.detalheId)
    if (!caixinha) {
      fecharDialogo($('#inv-dialog-detalhe'))
      return
    }

    const { resumo, porDono, lotes, ajustes, resgates } = caixinha.calculo
    const rentabilidade = resumo.investido > 0 ? (resumo.rendimentoBruto / resumo.investido) * 100 : 0
    const recentes = rendimentosRecentes(caixinha.calculo.serie)

    $('#inv-detalhe-tipo').textContent = [caixinha.tipo, caixinha.instituicao].filter(Boolean).join(' · ').toUpperCase()
    $('#inv-detalhe-nome').textContent = caixinha.nome

    const ajustePorConferencia = new Map(ajustes.map((item) => [item.conferenciaId, item]))
    const resgatePorMovimento = new Map(resgates.map((item) => [item.movimentoId, item]))
    const movimentos = [...caixinha.movimentos].sort((a, b) => (a.data === b.data ? b.id - a.id : a.data < b.data ? 1 : -1))

    $('#inv-detalhe-conteudo').innerHTML = `
      <div class="inv-chips">
        <span class="inv-chip">${porcentagem(caixinha.percentual_cdi)} do CDI</span>
        <span class="inv-chip inv-chip-suave">Resgate: ${esc(caixinha.liquidez)}</span>
        <span class="inv-chip inv-chip-suave">Vencimento: ${caixinha.vencimento ? dataBr(caixinha.vencimento) : '—'}</span>
        <span class="inv-chip inv-chip-suave">Criada em ${dataBr(caixinha.data_inicio)}</span>
      </div>

      <div class="inv-acoes">
        <button type="button" class="btn-new-expenses" data-aportar="${caixinha.id}">Aportar</button>
        <button type="button" class="inv-botao-secundario" data-resgatar="${caixinha.id}">Resgatar</button>
        <button type="button" class="inv-botao-secundario" data-conferir="${caixinha.id}">Conferir saldo</button>
        <button type="button" class="inv-botao-secundario" data-editar="${caixinha.id}">Editar</button>
        <button type="button" class="inv-botao-perigo" data-excluir="${caixinha.id}">Excluir</button>
      </div>

      <dl class="inv-resumo-grade">
        ${linhaResumo('Total investido', brl(resumo.investido))}
        ${linhaResumo('Saldo bruto', brl(resumo.saldoBruto), 'inv-forte')}
        ${linhaResumo('Rendimento bruto', `<span class="inv-positivo">${sinal(resumo.rendimentoBruto)}</span>`, '', porcentagem(rentabilidade))}
        ${linhaResumo('IOF sobre rendimento', `- ${brl(resumo.iof)}`, 'inv-negativo')}
        ${linhaResumo('IR sobre rendimento', `- ${brl(resumo.ir)}`, 'inv-negativo')}
        ${linhaResumo('Saldo líquido', brl(resumo.saldoLiquido), 'inv-forte', 'se resgatar hoje')}
        ${linhaResumo('Rendimento líquido', `<span class="inv-positivo">${sinal(resumo.rendimentoLiquido)}</span>`)}
        ${linhaResumo('Rendeu neste mês', sinal(recentes.noMes))}
        ${resumo.resgatadoBruto > 0 ? linhaResumo('Já resgatado (líquido)', brl(resumo.resgatadoLiquido)) : ''}
        ${resumo.resgatadoBruto > 0 ? linhaResumo('Rendimento total desde o início', sinal(resumo.rendimentoTotal)) : ''}
      </dl>

      <section class="inv-bloco">
        <div class="section-heading inv-grafico-cabecalho">
          <h3>Evolução</h3>
          <div class="inv-controles">
            <div class="inv-segmentado" role="group" aria-label="Período" data-grupo="periodo" data-alvo="detalhe">
              <button type="button" data-valor="dia">Dia</button>
              <button type="button" data-valor="mes">Mês</button>
              <button type="button" data-valor="ano">Ano</button>
            </div>
            <div class="inv-segmentado" role="group" aria-label="Mostrar" data-grupo="metrica" data-alvo="detalhe">
              <button type="button" data-valor="rendimento">Rendimento</button>
              <button type="button" data-valor="saldo">Saldo bruto</button>
            </div>
          </div>
        </div>
        <div id="inv-detalhe-grafico" class="chart-container"></div>
      </section>

      ${
        porDono.length > 0
          ? `<section class="inv-bloco"><h3>Dinheiro por pessoa</h3><div class="inv-donos">${'<!--donos-->'}</div></section>`
          : ''
      }

      ${
        lotes.length > 0
          ? `<section class="inv-bloco">
              <h3>Cálculo por aporte</h3>
              <p class="inv-dica">Cada aporte rende a partir da própria data e tem o próprio IR e IOF, conforme quantos dias tem.</p>
              <div class="inv-tabela-rolagem">
                <table class="inv-tabela">
                  <thead><tr><th>Data</th><th>Dono</th><th>Investido</th><th>Saldo bruto</th><th>Rendeu</th><th>Dias</th><th>IOF</th><th>IR</th></tr></thead>
                  <tbody>
                    ${lotes
                      .map(
                        (lote) => `<tr>
                          <td>${dataBr(lote.data)}</td>
                          <td>${esc(lote.dono)}</td>
                          <td>${brl(lote.investido)}</td>
                          <td>${brl(lote.saldoBruto)}</td>
                          <td class="inv-positivo">${sinal(lote.rendimentoBruto)}</td>
                          <td>${lote.dias}</td>
                          <td title="${brl(lote.iof)}">${porcentagem(lote.aliquotaIof * 100, 0)}</td>
                          <td title="${brl(lote.ir)}">${porcentagem(lote.aliquotaIr * 100, 1)}</td>
                        </tr>`,
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </section>`
          : ''
      }

      <section class="inv-bloco">
        <h3>Movimentações</h3>
        ${
          movimentos.length === 0
            ? '<p class="inv-dica">Nenhum aporte ainda.</p>'
            : `<ul class="inv-lista">${movimentos
                .map((mov) => {
                  const resgate = resgatePorMovimento.get(mov.id)
                  const extra = resgate
                    ? ` · líquido ${brl(resgate.liquido)} (IR ${brl(resgate.ir)}, IOF ${brl(resgate.iof)})`
                    : ''
                  return `<li>
                    <span class="inv-lista-icone ${mov.tipo === 'aporte' ? 'inv-entrada' : 'inv-saida'}" aria-hidden="true">${mov.tipo === 'aporte' ? '+' : '−'}</span>
                    <span class="inv-lista-texto">
                      <strong>${mov.tipo === 'aporte' ? 'Aporte' : 'Resgate'} · ${esc(mov.dono)}</strong>
                      <small>${dataBr(mov.data)}${extra}${mov.lancamento_id ? ' · vinculado à conta' : ''}</small>
                    </span>
                    <strong>${brl(mov.valor)}</strong>
                    <button type="button" class="inv-botao-icone" data-excluir-movimento="${mov.id}" aria-label="Excluir movimentação de ${dataBr(mov.data)}">
                      <svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-trash"></use></svg>
                    </button>
                  </li>`
                })
                .join('')}</ul>`
        }
      </section>

      <section class="inv-bloco">
        <h3>Conferências com o banco</h3>
        ${
          caixinha.conferencias.length === 0
            ? '<p class="inv-dica">Quando quiser, confira o saldo bruto com o app do banco para o Bolso ajustar qualquer diferença.</p>'
            : `<ul class="inv-lista">${[...caixinha.conferencias]
                .reverse()
                .map((conf) => {
                  const ajuste = ajustePorConferencia.get(conf.id)
                  return `<li>
                    <span class="inv-lista-texto">
                      <strong>${dataBr(conf.data)} · ${brl(conf.saldo_bruto)}</strong>
                      <small>${ajuste ? `Bolso calculava ${brl(ajuste.calculado)} · ajuste ${sinal(ajuste.diferenca)}` : 'Sem saldo nessa data'}</small>
                    </span>
                    <button type="button" class="inv-botao-icone" data-excluir-conferencia="${conf.id}" aria-label="Excluir conferência de ${dataBr(conf.data)}">
                      <svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-trash"></use></svg>
                    </button>
                  </li>`
                })
                .join('')}</ul>`
        }
      </section>
    `

    const containerDonos = $('#inv-detalhe-conteudo .inv-donos')
    if (containerDonos) renderizarDonos(containerDonos, porDono)

    atualizarControles('detalhe')
    renderizarGraficoDetalhe()
  }

  // ------------------------------------------------------------------
  // Diálogos
  // ------------------------------------------------------------------

  function abrirDialogo(dialogo) {
    if (!dialogo.open) dialogo.showModal()
  }

  function fecharDialogo(dialogo) {
    if (dialogo.open) dialogo.close()
  }

  document.querySelectorAll('.inv-dialog').forEach((dialogo) => {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-fechar]') || evento.target === dialogo) fecharDialogo(dialogo)
    })
  })

  function mostrarErro(form, mensagem) {
    const erro = $('.inv-form-erro', form)
    erro.textContent = mensagem || ''
    erro.hidden = !mensagem
  }

  function preencherContas(select) {
    const bancos = (typeof appData !== 'undefined' && Array.isArray(appData.bancos) && appData.bancos) || []
    select.innerHTML =
      '<option value="">Não vincular a uma conta</option>' +
      bancos.map((banco) => `<option value="${esc(banco.id)}">${esc(banco.nome)}</option>`).join('')
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

  function aposMudarConta(bancoId) {
    if (bancoId && typeof carregarLancamento === 'function') carregarLancamento()
  }

  // ----- Nova / editar caixinha -----

  const formCaixinha = $('#inv-form-caixinha')

  function abrirCaixinha(id = null) {
    estado.edicaoId = id
    formCaixinha.reset()
    mostrarErro(formCaixinha, '')
    preencherContas(formCaixinha.elements.bancoId)
    const caixinha = id ? caixinhaPorId(id) : null

    $('#inv-caixinha-titulo').textContent = caixinha ? 'Editar caixinha' : 'Nova caixinha'
    $('#inv-caixinha-aporte').hidden = Boolean(caixinha)
    formCaixinha.elements.data_inicio.max = hojeLocal()
    formCaixinha.elements.data_inicio.value = caixinha?.data_inicio || hojeLocal()

    if (caixinha) {
      formCaixinha.elements.nome.value = caixinha.nome
      formCaixinha.elements.instituicao.value = caixinha.instituicao || ''
      formCaixinha.elements.tipo.value = caixinha.tipo
      formCaixinha.elements.percentual_cdi.value = caixinha.percentual_cdi
      formCaixinha.elements.liquidez.value = caixinha.liquidez
      formCaixinha.elements.vencimento.value = caixinha.vencimento || ''
    }

    abrirDialogo($('#inv-dialog-caixinha'))
    formCaixinha.elements.nome.focus()
  }

  formCaixinha.addEventListener('submit', (evento) => {
    evento.preventDefault()
    const campos = formCaixinha.elements
    if (!campos.nome.value.trim()) return mostrarErro(formCaixinha, 'Dê um nome para a caixinha.')
    if (!(Number(campos.percentual_cdi.value) > 0)) return mostrarErro(formCaixinha, 'Informe o percentual do CDI.')
    if (!campos.data_inicio.value) return mostrarErro(formCaixinha, 'Informe a data de criação.')

    const corpo = {
      nome: campos.nome.value.trim(),
      instituicao: campos.instituicao.value.trim() || null,
      tipo: campos.tipo.value.trim() || 'CDB',
      percentual_cdi: Number(campos.percentual_cdi.value),
      liquidez: campos.liquidez.value.trim() || 'Diária',
      vencimento: campos.vencimento.value || null,
      data_inicio: campos.data_inicio.value,
    }

    enviar(formCaixinha, async () => {
      if (estado.edicaoId) {
        await api(`/investimentos/${estado.edicaoId}`, { method: 'PATCH', corpo })
        showPopup('Caixinha atualizada.')
      } else {
        if (campos.aporte_inicial.value) {
          corpo.aporte_inicial = Number(campos.aporte_inicial.value)
          corpo.dono = campos.dono.value.trim() || 'Eu'
          corpo.bancoId = campos.bancoId.value || null
        }
        await api('/investimentos', { method: 'POST', corpo })
        aposMudarConta(corpo.bancoId)
        showPopup('Caixinha criada.')
      }
      fecharDialogo($('#inv-dialog-caixinha'))
      await carregar()
    })
  })

  // ----- Aporte / resgate -----

  const formMovimento = $('#inv-form-movimento')

  function definirTipoMovimento(tipo) {
    estado.movimentoTipo = tipo
    const aporte = tipo === 'aporte'
    $('#inv-movimento-tipo')
      .querySelectorAll('button')
      .forEach((botao) => botao.setAttribute('aria-pressed', String(botao.dataset.valor === tipo)))
    $('#inv-movimento-titulo').textContent = aporte ? 'Novo aporte' : 'Novo resgate'
    $('#inv-movimento-salvar').textContent = aporte ? 'Registrar aporte' : 'Registrar resgate'
    $('#inv-movimento-valor-rotulo').textContent = aporte ? 'Valor' : 'Valor bruto a resgatar'
    $('#inv-movimento-conta-rotulo').textContent = aporte
      ? 'Descontar de uma conta do Bolso'
      : 'Depositar o valor líquido em uma conta do Bolso'
    atualizarDisponivel()
  }

  function atualizarDisponivel() {
    const dica = $('#inv-movimento-disponivel')
    const caixinha = caixinhaPorId(estado.movimentoCaixinhaId)
    if (!caixinha || estado.movimentoTipo !== 'resgate') {
      dica.hidden = true
      return
    }
    const disponiveis = caixinha.calculo.porDono.filter((item) => item.saldoBruto > 0)
    dica.hidden = false
    dica.textContent = disponiveis.length
      ? `Disponível hoje: ${disponiveis.map((item) => `${item.dono} ${brl(item.saldoBruto)}`).join(' · ')}. O resgate sai primeiro dos aportes mais antigos dessa pessoa.`
      : 'Não há saldo para resgatar.'
  }

  function abrirMovimento(id, tipo) {
    const caixinha = caixinhaPorId(id)
    if (!caixinha) return
    estado.movimentoCaixinhaId = caixinha.id
    formMovimento.reset()
    mostrarErro(formMovimento, '')
    preencherContas(formMovimento.elements.bancoId)
    $('#inv-movimento-caixinha').textContent = caixinha.nome.toUpperCase()
    formMovimento.elements.data.value = hojeLocal()
    formMovimento.elements.data.max = hojeLocal()
    formMovimento.elements.data.min = caixinha.data_inicio
    const donosComSaldo = caixinha.calculo.porDono.filter((item) => item.saldoBruto > 0)
    formMovimento.elements.dono.value = tipo === 'resgate' && donosComSaldo.length ? donosComSaldo[0].dono : 'Eu'
    definirTipoMovimento(tipo)
    abrirDialogo($('#inv-dialog-movimento'))
    formMovimento.elements.valor.focus()
  }

  $('#inv-movimento-tipo').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-valor]')
    if (botao) definirTipoMovimento(botao.dataset.valor)
  })

  formMovimento.addEventListener('submit', (evento) => {
    evento.preventDefault()
    const campos = formMovimento.elements
    if (!(Number(campos.valor.value) > 0)) return mostrarErro(formMovimento, 'Informe um valor maior que zero.')
    if (!campos.data.value) return mostrarErro(formMovimento, 'Informe a data.')
    if (!campos.dono.value.trim()) return mostrarErro(formMovimento, 'Informe de quem é o dinheiro.')

    const corpo = {
      tipo: estado.movimentoTipo,
      valor: Number(campos.valor.value),
      data: campos.data.value,
      dono: campos.dono.value.trim(),
      bancoId: campos.bancoId.value || null,
    }

    enviar(formMovimento, async () => {
      const resposta = await api(`/investimentos/${estado.movimentoCaixinhaId}/movimentos`, { method: 'POST', corpo })
      fecharDialogo($('#inv-dialog-movimento'))
      aposMudarConta(corpo.bancoId)
      showPopup(
        resposta.resgate
          ? `Resgate registrado. Líquido: ${brl(resposta.resgate.liquido)}.`
          : 'Aporte registrado.',
        3000,
      )
      await carregar()
    })
  })

  // ----- Conferência -----

  const formConferencia = $('#inv-form-conferencia')
  let conferenciaCaixinhaId = null

  function atualizarCalculadoNaData() {
    const caixinha = caixinhaPorId(conferenciaCaixinhaId)
    const data = formConferencia.elements.data.value
    const ponto = caixinha?.calculo.serie.find((item) => item.data === data)
    $('#inv-conferencia-calculado').textContent = ponto
      ? `O Bolso calcula ${brl(ponto.saldo)} nessa data.`
      : ''
  }

  function abrirConferencia(id) {
    const caixinha = caixinhaPorId(id)
    if (!caixinha) return
    conferenciaCaixinhaId = caixinha.id
    formConferencia.reset()
    mostrarErro(formConferencia, '')
    formConferencia.elements.data.value = hojeLocal()
    formConferencia.elements.data.max = hojeLocal()
    formConferencia.elements.data.min = caixinha.data_inicio
    atualizarCalculadoNaData()
    abrirDialogo($('#inv-dialog-conferencia'))
    formConferencia.elements.saldo_bruto.focus()
  }

  formConferencia.elements.data.addEventListener('change', atualizarCalculadoNaData)

  formConferencia.addEventListener('submit', (evento) => {
    evento.preventDefault()
    const campos = formConferencia.elements
    if (!campos.data.value) return mostrarErro(formConferencia, 'Informe a data.')
    if (!(Number(campos.saldo_bruto.value) > 0)) return mostrarErro(formConferencia, 'Informe o saldo bruto.')

    enviar(formConferencia, async () => {
      await api(`/investimentos/${conferenciaCaixinhaId}/conferencias`, {
        method: 'POST',
        corpo: { data: campos.data.value, saldo_bruto: Number(campos.saldo_bruto.value) },
      })
      fecharDialogo($('#inv-dialog-conferencia'))
      showPopup('Saldo conferido.')
      await carregar()
    })
  })

  // ----- Exclusões -----

  async function executarComAviso(acao, mensagemSucesso) {
    try {
      const resposta = await acao()
      showPopup(mensagemSucesso, 2600)
      await carregar()
      return resposta
    } catch (erro) {
      showPopup(erro.message, 3500)
      return null
    }
  }

  async function excluirCaixinha(id) {
    const caixinha = caixinhaPorId(id)
    if (!caixinha) return
    const vinculados = caixinha.movimentos.filter((mov) => mov.lancamento_id).length
    const aviso = vinculados
      ? `\n\n${vinculados} lançamento(s) vinculado(s) às suas contas também serão removidos.`
      : ''
    if (!confirm(`Excluir a caixinha "${caixinha.nome}" e todo o histórico dela?${aviso}`)) return

    const resposta = await executarComAviso(
      () => api(`/investimentos/${id}`, { method: 'DELETE' }),
      'Caixinha excluída.',
    )
    if (resposta) {
      fecharDialogo($('#inv-dialog-detalhe'))
      aposMudarConta(resposta.lancamentosRemovidos > 0)
    }
  }

  async function excluirMovimento(movimentoId) {
    const caixinha = caixinhaPorId(estado.detalheId)
    const movimento = caixinha?.movimentos.find((mov) => mov.id === Number(movimentoId))
    if (!movimento) return
    const aviso = movimento.lancamento_id ? ' O lançamento vinculado na conta também será removido.' : ''
    if (!confirm(`Excluir ${movimento.tipo} de ${brl(movimento.valor)} em ${dataBr(movimento.data)}?${aviso}`)) return

    const resposta = await executarComAviso(
      () => api(`/investimentos/${caixinha.id}/movimentos/${movimento.id}`, { method: 'DELETE' }),
      'Movimentação excluída.',
    )
    if (resposta) aposMudarConta(resposta.lancamentoRemovido)
  }

  async function excluirConferencia(conferenciaId) {
    const caixinha = caixinhaPorId(estado.detalheId)
    if (!caixinha || !confirm('Excluir esta conferência? O cálculo volta a usar só o CDI nessa data.')) return
    await executarComAviso(
      () => api(`/investimentos/${caixinha.id}/conferencias/${conferenciaId}`, { method: 'DELETE' }),
      'Conferência excluída.',
    )
  }

  // ----- Ações (delegação) -----

  document.addEventListener('click', (evento) => {
    const alvo = evento.target.closest(
      '[data-abrir],[data-aportar],[data-resgatar],[data-conferir],[data-editar],[data-excluir],[data-excluir-movimento],[data-excluir-conferencia]',
    )
    if (!alvo || !(pagina.contains(alvo) || alvo.closest('.inv-dialog'))) return
    const d = alvo.dataset

    if (d.abrir) {
      estado.detalheId = Number(d.abrir)
      renderizarDetalhe()
      abrirDialogo($('#inv-dialog-detalhe'))
    } else if (d.aportar) abrirMovimento(d.aportar, 'aporte')
    else if (d.resgatar) abrirMovimento(d.resgatar, 'resgate')
    else if (d.conferir) abrirConferencia(d.conferir)
    else if (d.editar) abrirCaixinha(Number(d.editar))
    else if (d.excluir) excluirCaixinha(Number(d.excluir))
    else if (d.excluirMovimento) excluirMovimento(d.excluirMovimento)
    else if (d.excluirConferencia) excluirConferencia(d.excluirConferencia)
  })

  $('#inv-btn-nova').addEventListener('click', () => abrirCaixinha())

  atualizarControles('carteira')
  carregar()
})()
