// Cálculo de investimentos pós-fixados atrelados ao CDI (ex.: CDB % do CDI).
//
// Modelo: cada aporte vira um "lote" com dono, data e valor investido. Todo
// dia útil o valor bruto de cada lote cresce pelo fator do CDI daquele dia
// multiplicado pelo percentual contratado. Como cada lote rende só a partir da
// própria data, a divisão do rendimento entre donos (ex.: você e sua namorada)
// é exata, e o IR/IOF de cada lote respeita a idade dele.
//
// Datas são sempre strings ISO 'YYYY-MM-DD' (sem fuso).

// IOF regressivo: percentual do rendimento cobrado por dias corridos
// desde o aporte. A partir do 30º dia não há IOF.
const TABELA_IOF = [
  100, 96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40,
  36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3,
]

function aliquotaIof(dias) {
  if (dias >= 30) return 0
  return TABELA_IOF[Math.max(0, dias)] / 100
}

// IR regressivo da renda fixa, por dias corridos desde o aporte.
function aliquotaIr(dias) {
  if (dias <= 180) return 0.225
  if (dias <= 360) return 0.2
  if (dias <= 720) return 0.175
  return 0.15
}

function paraUtc(dataIso) {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  return Date.UTC(ano, mes - 1, dia)
}

function deUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function somarDias(dataIso, dias) {
  return deUtc(paraUtc(dataIso) + dias * 86400000)
}

function diasEntre(inicioIso, fimIso) {
  return Math.round((paraUtc(fimIso) - paraUtc(inicioIso)) / 86400000)
}

function ehFimDeSemana(dataIso) {
  const diaSemana = new Date(paraUtc(dataIso)).getUTCDay()
  return diaSemana === 0 || diaSemana === 6
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

const cacheFeriados = new Map()

// Feriados bancários nacionais (usados só para estimar dias ainda sem CDI publicado).
function ehFeriadoNacional(dataIso) {
  const ano = Number(dataIso.slice(0, 4))
  if (!cacheFeriados.has(ano)) {
    const domingoPascoa = pascoa(ano)
    cacheFeriados.set(
      ano,
      new Set([
        ...['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(
          (diaMes) => `${ano}-${diaMes}`,
        ),
        somarDias(domingoPascoa, -48), // segunda de Carnaval
        somarDias(domingoPascoa, -47), // terça de Carnaval
        somarDias(domingoPascoa, -2), // Sexta-feira Santa
        somarDias(domingoPascoa, 60), // Corpus Christi
      ]),
    )
  }
  return cacheFeriados.get(ano).has(dataIso)
}

function hojeIso() {
  // Data local do servidor no fuso de Brasília, para o "hoje" bater com o app do banco.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function truncarCentavos(valor) {
  // Bancos costumam truncar impostos (ex.: 3,58 × 22,5% = 0,8055 → 0,80).
  return Math.floor(valor * 100 + 1e-9) / 100
}

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator + 0 // + 0 evita "-0"
}

// Taxa diária (em %) a aplicar na passagem do dia `dataIso` para o seguinte.
// Retorna null quando não é dia útil (não há rendimento).
//  - Dias presentes na série do Banco Central são dias úteis com taxa oficial.
//  - Dias até a última data publicada que não estão na série são feriados/fins de semana.
//  - Dias depois da última publicação são estimados com a última taxa conhecida,
//    pulando sábados e domingos (feriados futuros não são conhecidos).
function taxaDoDia(dataIso, cdi) {
  if (cdi.mapa.has(dataIso)) {
    return { taxa: cdi.mapa.get(dataIso), estimada: false }
  }

  if (!cdi.ultimaData || dataIso <= cdi.ultimaData) {
    return null
  }

  if (ehFimDeSemana(dataIso) || ehFeriadoNacional(dataIso) || cdi.ultimaTaxa === null) {
    return null
  }

  return { taxa: cdi.ultimaTaxa, estimada: true }
}

function impostosDoLote(lote, dataReferencia, isento = false) {
  const dias = diasEntre(lote.data, dataReferencia)
  const rendimento = Math.max(0, lote.valor - lote.principal)
  const percentualIof = isento ? 0 : aliquotaIof(dias)
  const percentualIr = isento ? 0 : aliquotaIr(dias)
  const iof = rendimento * percentualIof
  const ir = (rendimento - iof) * percentualIr

  return {
    dias,
    rendimento,
    iof,
    ir,
    aliquotaIof: percentualIof,
    aliquotaIr: percentualIr,
  }
}

// Consome `valor` (bruto) dos lotes de `dono`, do mais antigo para o mais novo.
// Retorna o detalhamento ou null se o dono não tiver saldo suficiente.
function resgatarDosLotes(lotes, dono, valor, dataReferencia, isento = false) {
  const lotesDoDono = lotes
    .filter((lote) => lote.dono === dono && lote.valor > 0.000001)
    .sort((a, b) => (a.data === b.data ? a.ordem - b.ordem : a.data < b.data ? -1 : 1))

  const disponivel = lotesDoDono.reduce((soma, lote) => soma + lote.valor, 0)

  if (valor > disponivel + 0.005) {
    return null
  }

  let restante = Math.min(valor, disponivel)
  let principalResgatado = 0
  let iof = 0
  let ir = 0

  for (const lote of lotesDoDono) {
    if (restante <= 0.000001) break

    const retirada = Math.min(restante, lote.valor)
    const fracao = retirada / lote.valor
    const impostos = impostosDoLote(lote, dataReferencia, isento)

    principalResgatado += lote.principal * fracao
    iof += impostos.iof * fracao
    ir += impostos.ir * fracao

    lote.principal -= lote.principal * fracao
    lote.valor -= retirada
    restante -= retirada
  }

  const iofTruncado = truncarCentavos(iof)
  const irTruncado = truncarCentavos(ir)

  return {
    principalResgatado,
    rendimentoResgatado: valor - principalResgatado,
    iof: iofTruncado,
    ir: irTruncado,
    liquido: arredondar(valor - iofTruncado - irTruncado),
  }
}

/**
 * Simula um investimento do primeiro movimento até `ate`.
 *
 * @param {object} investimento  { percentual_cdi }
 * @param {Array}  movimentos    [{ id, tipo: 'aporte'|'resgate', valor, data, dono }]
 * @param {Array}  conferencias  [{ id, data, saldo_bruto }]
 * @param {object} cdi           { mapa: Map<data, taxa% ao dia>, ultimaData, ultimaTaxa }
 * @param {string} ate           data final (inclusive), padrão hoje
 */
function simularInvestimento(investimento, movimentos, conferencias, cdi, ate = hojeIso()) {
  const percentual = Number(investimento.percentual_cdi) / 100
  // LCI, LCA e afins são isentos de IR (e de IOF) para pessoa física.
  const isento = /^(LCI|LCA|LCD|LIG|CRI|CRA)(\s|$)/i.test(String(investimento.tipo || '').trim())
  const ordenados = [...movimentos].sort((a, b) =>
    a.data === b.data ? Number(a.id) - Number(b.id) : a.data < b.data ? -1 : 1,
  )

  const movimentosPorData = new Map()
  ordenados.forEach((mov) => {
    if (!movimentosPorData.has(mov.data)) movimentosPorData.set(mov.data, [])
    movimentosPorData.get(mov.data).push(mov)
  })

  const conferenciasPorData = new Map()
  conferencias.forEach((conf) => conferenciasPorData.set(conf.data, conf))

  const lotes = []
  const serie = []
  const erros = []
  const resgates = []
  const ajustes = []
  let usouEstimativa = false
  let resgatadoBruto = 0
  let resgatadoLiquido = 0
  let rendimentoRealizado = 0
  let impostosPagos = 0

  if (ordenados.length === 0) {
    return montarResultado()
  }

  const inicio = ordenados[0].data
  let saldoAnterior = 0

  for (let data = inicio; data <= ate; data = somarDias(data, 1)) {
    // 1. Rendimento do dia útil anterior.
    if (data !== inicio) {
      const taxa = taxaDoDia(somarDias(data, -1), cdi)
      if (taxa) {
        if (taxa.estimada) usouEstimativa = true
        const fator = 1 + (taxa.taxa / 100) * percentual
        lotes.forEach((lote) => {
          lote.valor *= fator
        })
      }
    }

    let aportesDia = 0
    let resgatesDia = 0

    // 2. Aportes e resgates do dia.
    for (const mov of movimentosPorData.get(data) || []) {
      const valor = Number(mov.valor)

      if (mov.tipo === 'aporte') {
        lotes.push({
          movimentoId: mov.id,
          ordem: Number(mov.id) || lotes.length,
          dono: mov.dono,
          data: mov.data,
          aporteOriginal: valor,
          principal: valor,
          valor,
        })
        aportesDia += valor
      } else {
        const detalhe = resgatarDosLotes(lotes, mov.dono, valor, data, isento)
        if (!detalhe) {
          erros.push({
            movimentoId: mov.id,
            mensagem: `Saldo insuficiente de ${mov.dono} para resgatar em ${data}.`,
          })
          continue
        }
        resgatesDia += valor
        resgatadoBruto += valor
        resgatadoLiquido += detalhe.liquido
        rendimentoRealizado += detalhe.rendimentoResgatado
        impostosPagos += detalhe.iof + detalhe.ir
        resgates.push({ movimentoId: mov.id, data, dono: mov.dono, valor, ...detalhe })
      }
    }

    // 3. Conferência com o saldo do banco: ajusta todos os lotes na mesma proporção.
    const conferencia = conferenciasPorData.get(data)
    if (conferencia) {
      const calculado = somaValores()
      const banco = Number(conferencia.saldo_bruto)
      if (calculado > 0 && banco > 0) {
        const razao = banco / calculado
        lotes.forEach((lote) => {
          lote.valor *= razao
        })
        ajustes.push({
          conferenciaId: conferencia.id,
          data,
          calculado: arredondar(calculado),
          banco,
          diferenca: arredondar(banco - calculado),
        })
      }
    }

    const saldo = somaValores()
    // Rendimento do dia = variação do saldo que não veio de aporte/resgate.
    const rendimentoDia = saldo - saldoAnterior - aportesDia + resgatesDia

    serie.push({
      data,
      saldo: arredondar(saldo, 4),
      rendimento: arredondar(rendimentoDia, 6),
      aportes: aportesDia,
      resgates: resgatesDia,
    })

    saldoAnterior = saldo
  }

  return montarResultado()

  function somaValores() {
    return lotes.reduce((soma, lote) => soma + lote.valor, 0)
  }

  function resumirLotes(lista) {
    let saldoBruto = 0
    let investido = 0
    let iof = 0
    let ir = 0

    lista.forEach((lote) => {
      const impostos = impostosDoLote(lote, ate, isento)
      saldoBruto += lote.valor
      investido += lote.principal
      iof += impostos.iof
      ir += impostos.ir
    })

    const iofTruncado = truncarCentavos(iof)
    const irTruncado = truncarCentavos(ir)
    const saldoBrutoArredondado = arredondar(saldoBruto)
    const investidoArredondado = arredondar(investido)

    return {
      saldoBruto: saldoBrutoArredondado,
      investido: investidoArredondado,
      rendimentoBruto: arredondar(saldoBrutoArredondado - investidoArredondado),
      iof: iofTruncado,
      ir: irTruncado,
      saldoLiquido: arredondar(saldoBrutoArredondado - iofTruncado - irTruncado),
      rendimentoLiquido: arredondar(
        saldoBrutoArredondado - investidoArredondado - iofTruncado - irTruncado,
      ),
    }
  }

  function montarResultado() {
    const lotesAtivos = lotes.filter((lote) => lote.valor > 0.004)
    const donos = [...new Set(lotes.map((lote) => lote.dono))]
    const totalAportado = ordenados
      .filter((mov) => mov.tipo === 'aporte')
      .reduce((soma, mov) => soma + Number(mov.valor), 0)

    const porDono = donos.map((dono) => {
      const doDono = lotesAtivos.filter((lote) => lote.dono === dono)
      const aportado = ordenados
        .filter((mov) => mov.tipo === 'aporte' && mov.dono === dono)
        .reduce((soma, mov) => soma + Number(mov.valor), 0)
      return { dono, aportado: arredondar(aportado), ...resumirLotes(doDono) }
    })

    const resumo = resumirLotes(lotesAtivos)
    const totalSaldo = resumo.saldoBruto
    porDono.forEach((item) => {
      item.participacao = totalSaldo > 0 ? arredondar((item.saldoBruto / totalSaldo) * 100, 2) : 0
    })

    return {
      dataReferencia: ate,
      isentoIr: isento,
      usouEstimativa,
      resumo: {
        ...resumo,
        totalAportado: arredondar(totalAportado),
        resgatadoBruto: arredondar(resgatadoBruto),
        resgatadoLiquido: arredondar(resgatadoLiquido),
        rendimentoRealizado: arredondar(rendimentoRealizado),
        impostosPagos: arredondar(impostosPagos),
        // Tudo que já rendeu desde o início (no saldo + o que já foi resgatado).
        rendimentoTotal: arredondar(resumo.rendimentoBruto + rendimentoRealizado),
      },
      porDono,
      lotes: lotesAtivos.map((lote) => {
        const impostos = impostosDoLote(lote, ate, isento)
        return {
          movimentoId: lote.movimentoId,
          dono: lote.dono,
          data: lote.data,
          aporteOriginal: arredondar(lote.aporteOriginal),
          investido: arredondar(lote.principal),
          saldoBruto: arredondar(lote.valor),
          rendimentoBruto: arredondar(lote.valor - lote.principal),
          dias: impostos.dias,
          aliquotaIof: impostos.aliquotaIof,
          aliquotaIr: impostos.aliquotaIr,
          iof: arredondar(impostos.iof),
          ir: arredondar(impostos.ir),
        }
      }),
      resgates,
      ajustes,
      erros,
      serie,
    }
  }
}

module.exports = {
  aliquotaIof,
  aliquotaIr,
  diasEntre,
  hojeIso,
  somarDias,
  simularInvestimento,
  truncarCentavos,
}
