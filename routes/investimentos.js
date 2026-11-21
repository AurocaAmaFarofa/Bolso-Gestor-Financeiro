const express = require('express')
const router = express.Router()

const pool = require('../db/connections')
const exigirLogin = require('../middleware/auth')
const { obterCdi } = require('../lib/cdi')
const { hojeIso, simularInvestimento } = require('../lib/investimentoCalculo')

// ----------------------------------------------------------------------------
// Tabelas (criadas na primeira requisição, para funcionar também em bancos já
// inicializados, onde estrutura_bolso.sql não é reaplicado).
// ----------------------------------------------------------------------------

const SQL_TABELAS = [
  `CREATE TABLE IF NOT EXISTS investimentos (
    id INT NOT NULL AUTO_INCREMENT,
    usuarioId INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    instituicao VARCHAR(80) DEFAULT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'CDB',
    percentual_cdi DECIMAL(7,3) NOT NULL,
    liquidez VARCHAR(40) NOT NULL DEFAULT 'Diária',
    vencimento DATE DEFAULT NULL,
    data_inicio DATE NOT NULL,
    criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_investimentos_usuario (usuarioId),
    CONSTRAINT fk_investimentos_usuario FOREIGN KEY (usuarioId) REFERENCES usuarios (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS investimento_movimentos (
    id INT NOT NULL AUTO_INCREMENT,
    investimento_id INT NOT NULL,
    usuarioId INT NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    valor DECIMAL(14,2) NOT NULL,
    data DATE NOT NULL,
    dono VARCHAR(60) NOT NULL,
    lancamento_id INT DEFAULT NULL,
    criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_movimentos_investimento (investimento_id),
    CONSTRAINT fk_movimentos_investimento FOREIGN KEY (investimento_id) REFERENCES investimentos (id) ON DELETE CASCADE,
    CONSTRAINT chk_movimento_tipo CHECK (tipo IN ('aporte', 'resgate')),
    CONSTRAINT chk_movimento_valor CHECK (valor > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS investimento_conferencias (
    id INT NOT NULL AUTO_INCREMENT,
    investimento_id INT NOT NULL,
    usuarioId INT NOT NULL,
    data DATE NOT NULL,
    saldo_bruto DECIMAL(14,2) NOT NULL,
    criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_conferencia_dia (investimento_id, data),
    CONSTRAINT fk_conferencias_investimento FOREIGN KEY (investimento_id) REFERENCES investimentos (id) ON DELETE CASCADE,
    CONSTRAINT chk_conferencia_valor CHECK (saldo_bruto > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cdi_diario (
    data DATE NOT NULL,
    taxa DECIMAL(12,8) NOT NULL,
    PRIMARY KEY (data)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]

let tabelasProntas = null

function garantirTabelas() {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      for (const sql of SQL_TABELAS) {
        await pool.query(sql)
      }
    })().catch((erro) => {
      tabelasProntas = null
      throw erro
    })
  }
  return tabelasProntas
}

router.use(exigirLogin, async (req, res, next) => {
  try {
    await garantirTabelas()
    next()
  } catch (erro) {
    console.log('Erro ao preparar tabelas de investimentos:', erro)
    res.status(500).json({ erro: 'Erro ao preparar investimentos.' })
  }
})

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const [ano, mes, dia] = data.split('-').map(Number)
  const objeto = new Date(Date.UTC(ano, mes - 1, dia))
  return objeto.getUTCFullYear() === ano && objeto.getUTCMonth() === mes - 1 && objeto.getUTCDate() === dia
}

function idValido(valor) {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : null
}

function textoValido(valor, maximo) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= maximo
}

function valorMonetario(valor) {
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0 || numero > 999999999999) return null
  return Math.round(numero * 100) / 100
}

function lerDadosInvestimento(corpo, parcial = false) {
  const dados = {}
  const erros = []

  if (!parcial || corpo.nome !== undefined) {
    if (!textoValido(corpo.nome, 120)) erros.push('Nome da caixinha inválido.')
    else dados.nome = corpo.nome.trim()
  }

  if (corpo.instituicao !== undefined) {
    if (corpo.instituicao === null || corpo.instituicao === '') dados.instituicao = null
    else if (!textoValido(corpo.instituicao, 80)) erros.push('Instituição inválida.')
    else dados.instituicao = corpo.instituicao.trim()
  }

  if (corpo.tipo !== undefined) {
    if (!textoValido(corpo.tipo, 30)) erros.push('Tipo inválido.')
    else dados.tipo = corpo.tipo.trim()
  }

  if (!parcial || corpo.percentual_cdi !== undefined) {
    const percentual = Number(corpo.percentual_cdi)
    if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 1000) {
      erros.push('Percentual do CDI inválido.')
    } else {
      dados.percentual_cdi = percentual
    }
  }

  if (corpo.liquidez !== undefined) {
    if (!textoValido(corpo.liquidez, 40)) erros.push('Prazo de resgate inválido.')
    else dados.liquidez = corpo.liquidez.trim()
  }

  if (corpo.vencimento !== undefined) {
    if (corpo.vencimento === null || corpo.vencimento === '') dados.vencimento = null
    else if (!dataValida(corpo.vencimento)) erros.push('Data de vencimento inválida.')
    else dados.vencimento = corpo.vencimento
  }

  if (!parcial || corpo.data_inicio !== undefined) {
    if (!dataValida(corpo.data_inicio)) erros.push('Data de criação inválida.')
    else if (corpo.data_inicio > hojeIso()) erros.push('A data de criação não pode estar no futuro.')
    else dados.data_inicio = corpo.data_inicio
  }

  return { dados, erros }
}

// ----------------------------------------------------------------------------
// Leitura e cálculo
// ----------------------------------------------------------------------------

async function carregarDoUsuario(usuarioId, investimentoId = null) {
  const filtro = investimentoId ? 'AND id = ?' : ''
  const parametros = investimentoId ? [usuarioId, investimentoId] : [usuarioId]

  const [investimentos] = await pool.query(
    `SELECT id, nome, instituicao, tipo, percentual_cdi, liquidez,
            DATE_FORMAT(vencimento, '%Y-%m-%d') AS vencimento,
            DATE_FORMAT(data_inicio, '%Y-%m-%d') AS data_inicio
     FROM investimentos
     WHERE usuarioId = ? ${filtro}
     ORDER BY data_inicio, id`,
    parametros,
  )

  if (investimentos.length === 0) return []

  const ids = investimentos.map((item) => item.id)

  const [movimentos] = await pool.query(
    `SELECT id, investimento_id, tipo, valor, DATE_FORMAT(data, '%Y-%m-%d') AS data, dono, lancamento_id
     FROM investimento_movimentos
     WHERE usuarioId = ? AND investimento_id IN (?)
     ORDER BY data, id`,
    [usuarioId, ids],
  )

  const [conferencias] = await pool.query(
    `SELECT id, investimento_id, DATE_FORMAT(data, '%Y-%m-%d') AS data, saldo_bruto
     FROM investimento_conferencias
     WHERE usuarioId = ? AND investimento_id IN (?)
     ORDER BY data`,
    [usuarioId, ids],
  )

  return investimentos.map((investimento) => ({
    ...investimento,
    percentual_cdi: Number(investimento.percentual_cdi),
    movimentos: movimentos
      .filter((mov) => mov.investimento_id === investimento.id)
      .map((mov) => ({ ...mov, valor: Number(mov.valor) })),
    conferencias: conferencias
      .filter((conf) => conf.investimento_id === investimento.id)
      .map((conf) => ({ ...conf, saldo_bruto: Number(conf.saldo_bruto) })),
  }))
}

function primeiraData(investimentos) {
  const datas = investimentos.flatMap((item) => [
    item.data_inicio,
    ...item.movimentos.map((mov) => mov.data),
  ])
  return datas.length ? datas.sort()[0] : hojeIso()
}

function calcular(investimento, cdi, extras = {}) {
  const movimentos = extras.movimentos || investimento.movimentos
  const conferencias = extras.conferencias || investimento.conferencias
  return simularInvestimento(investimento, movimentos, conferencias, cdi)
}

function somarSeries(series) {
  const porData = new Map()
  series.flat().forEach((ponto) => {
    const atual = porData.get(ponto.data) || { data: ponto.data, saldo: 0, rendimento: 0, aportes: 0, resgates: 0 }
    atual.saldo += ponto.saldo
    atual.rendimento += ponto.rendimento
    atual.aportes += ponto.aportes
    atual.resgates += ponto.resgates
    porData.set(ponto.data, atual)
  })
  return [...porData.values()].sort((a, b) => (a.data < b.data ? -1 : 1))
}

function somarPorDono(listas) {
  const porDono = new Map()
  listas.flat().forEach((item) => {
    const atual = porDono.get(item.dono) || {
      dono: item.dono, aportado: 0, investido: 0, saldoBruto: 0, rendimentoBruto: 0, iof: 0, ir: 0, saldoLiquido: 0,
    }
    ;['aportado', 'investido', 'saldoBruto', 'rendimentoBruto', 'iof', 'ir', 'saldoLiquido'].forEach((campo) => {
      atual[campo] = Math.round((atual[campo] + item[campo]) * 100) / 100
    })
    porDono.set(item.dono, atual)
  })
  return [...porDono.values()]
}

// Verifica se um conjunto de movimentos é possível (nenhum resgate maior que o saldo do dono).
async function validarMovimentos(investimento, movimentos, conferencias) {
  const cdi = await obterCdi(primeiraData([{ ...investimento, movimentos }]))
  const resultado = simularInvestimento(investimento, movimentos, conferencias, cdi)
  return { resultado, cdi }
}

router.get('/', async (req, res) => {
  try {
    const investimentos = await carregarDoUsuario(req.usuarioId)
    const cdi = await obterCdi(primeiraData(investimentos))

    const caixinhas = investimentos.map((investimento) => ({
      ...investimento,
      calculo: calcular(investimento, cdi),
    }))

    const somar = (campo) =>
      Math.round(caixinhas.reduce((soma, item) => soma + item.calculo.resumo[campo], 0) * 100) / 100

    res.json({
      dataReferencia: hojeIso(),
      cdi: {
        ultimaData: cdi.ultimaData,
        ultimaTaxaDiaria: cdi.ultimaTaxa,
        taxaAnual: cdi.taxaAnual === null ? null : Math.round(cdi.taxaAnual * 100) / 100,
        aviso: cdi.aviso,
      },
      carteira: {
        saldoBruto: somar('saldoBruto'),
        investido: somar('investido'),
        rendimentoBruto: somar('rendimentoBruto'),
        iof: somar('iof'),
        ir: somar('ir'),
        saldoLiquido: somar('saldoLiquido'),
        rendimentoTotal: somar('rendimentoTotal'),
        usouEstimativa: caixinhas.some((item) => item.calculo.usouEstimativa),
        porDono: somarPorDono(caixinhas.map((item) => item.calculo.porDono)),
        serie: somarSeries(caixinhas.map((item) => item.calculo.serie)),
      },
      donos: [...new Set(investimentos.flatMap((item) => item.movimentos.map((mov) => mov.dono)))],
      caixinhas,
    })
  } catch (erro) {
    console.log('Erro ao buscar investimentos:', erro)
    res.status(500).json({ erro: 'Erro ao buscar investimentos.' })
  }
})

// ----------------------------------------------------------------------------
// Vínculo opcional com a conta bancária do app
// ----------------------------------------------------------------------------

async function obterCategoriaInvestimentos(conexao, usuarioId) {
  await conexao.query(
    `INSERT IGNORE INTO categorias_gasto (usuario_id, nome) VALUES (?, 'investimentos')`,
    [usuarioId],
  )
  const [linhas] = await conexao.query(
    `SELECT id FROM categorias_gasto WHERE usuario_id = ? AND nome = 'investimentos'`,
    [usuarioId],
  )
  return linhas[0].id
}

async function bancoDoUsuario(conexao, usuarioId, bancoId) {
  const [linhas] = await conexao.query('SELECT id FROM bancos WHERE id = ? AND usuarioId = ?', [bancoId, usuarioId])
  return linhas.length > 0
}

async function criarLancamentoVinculado(conexao, usuarioId, { bancoId, tipo, valor, data, descricao }) {
  const categoriaId = await obterCategoriaInvestimentos(conexao, usuarioId)
  // Meio-dia no horário de Brasília, para a data não "pular" por causa de fuso.
  const timestamp = new Date(`${data}T12:00:00-03:00`).getTime()
  const [resultado] = await conexao.query(
    `INSERT INTO lancamentos (tipo, valor, categoria_id, descricao, forma, data, mesAno, bancoId, usuarioId)
     VALUES (?, ?, ?, ?, 'transferencia', ?, ?, ?, ?)`,
    [tipo, valor, categoriaId, descricao.slice(0, 255), timestamp, data.slice(0, 7), String(bancoId), usuarioId],
  )
  return resultado.insertId
}

// ----------------------------------------------------------------------------
// Caixinhas
// ----------------------------------------------------------------------------

router.post('/', async (req, res) => {
  const { dados, erros } = lerDadosInvestimento(req.body)
  const aporteInicial = req.body.aporte_inicial === undefined || req.body.aporte_inicial === null || req.body.aporte_inicial === ''
    ? null
    : valorMonetario(req.body.aporte_inicial)
  const dono = typeof req.body.dono === 'string' && req.body.dono.trim() ? req.body.dono.trim() : 'Eu'
  const bancoId = req.body.bancoId ? idValido(req.body.bancoId) : null

  if (req.body.aporte_inicial && aporteInicial === null) erros.push('Valor do aporte inicial inválido.')
  if (dono.length > 60) erros.push('Nome do dono muito longo.')
  if (req.body.bancoId && !bancoId) erros.push('Conta inválida.')
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') })

  const conexao = await pool.getConnection()
  try {
    await conexao.beginTransaction()

    if (bancoId && !(await bancoDoUsuario(conexao, req.usuarioId, bancoId))) {
      await conexao.rollback()
      return res.status(400).json({ erro: 'Conta não encontrada.' })
    }

    const [resultado] = await conexao.query(
      `INSERT INTO investimentos (usuarioId, nome, instituicao, tipo, percentual_cdi, liquidez, vencimento, data_inicio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.usuarioId,
        dados.nome,
        dados.instituicao ?? null,
        dados.tipo ?? 'CDB',
        dados.percentual_cdi,
        dados.liquidez ?? 'Diária',
        dados.vencimento ?? null,
        dados.data_inicio,
      ],
    )

    if (aporteInicial) {
      const lancamentoId = bancoId
        ? await criarLancamentoVinculado(conexao, req.usuarioId, {
            bancoId,
            tipo: 'despesa',
            valor: aporteInicial,
            data: dados.data_inicio,
            descricao: `Aporte: ${dados.nome}`,
          })
        : null

      await conexao.query(
        `INSERT INTO investimento_movimentos (investimento_id, usuarioId, tipo, valor, data, dono, lancamento_id)
         VALUES (?, ?, 'aporte', ?, ?, ?, ?)`,
        [resultado.insertId, req.usuarioId, aporteInicial, dados.data_inicio, dono, lancamentoId],
      )
    }

    await conexao.commit()
    res.status(201).json({ mensagem: 'Caixinha criada', id: resultado.insertId })
  } catch (erro) {
    await conexao.rollback()
    console.log('Erro ao criar investimento:', erro)
    res.status(500).json({ erro: 'Erro ao criar caixinha.' })
  } finally {
    conexao.release()
  }
})

router.patch('/:id', async (req, res) => {
  const id = idValido(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  const { dados, erros } = lerDadosInvestimento(req.body, true)
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') })
  if (Object.keys(dados).length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' })

  try {
    const [atual] = await carregarDoUsuario(req.usuarioId, id)
    if (!atual) return res.status(404).json({ erro: 'Caixinha não encontrada.' })

    const novaDataInicio = dados.data_inicio || atual.data_inicio
    if (atual.movimentos.some((mov) => mov.data < novaDataInicio)) {
      return res.status(422).json({ erro: 'Há movimentações antes dessa data de criação.' })
    }

    const campos = Object.keys(dados)
    await pool.query(
      `UPDATE investimentos SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE id = ? AND usuarioId = ?`,
      [...campos.map((campo) => dados[campo]), id, req.usuarioId],
    )
    res.json({ mensagem: 'Caixinha atualizada', id })
  } catch (erro) {
    console.log('Erro ao atualizar investimento:', erro)
    res.status(500).json({ erro: 'Erro ao atualizar caixinha.' })
  }
})

router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  const conexao = await pool.getConnection()
  try {
    await conexao.beginTransaction()
    const [movimentos] = await conexao.query(
      `SELECT lancamento_id FROM investimento_movimentos
       WHERE investimento_id = ? AND usuarioId = ? AND lancamento_id IS NOT NULL`,
      [id, req.usuarioId],
    )
    const [resultado] = await conexao.query('DELETE FROM investimentos WHERE id = ? AND usuarioId = ?', [id, req.usuarioId])

    if (resultado.affectedRows === 0) {
      await conexao.rollback()
      return res.status(404).json({ erro: 'Caixinha não encontrada.' })
    }

    const lancamentos = movimentos.map((mov) => mov.lancamento_id)
    if (lancamentos.length) {
      await conexao.query('DELETE FROM lancamentos WHERE id IN (?) AND usuarioId = ?', [lancamentos, req.usuarioId])
    }

    await conexao.commit()
    res.json({ mensagem: 'Caixinha excluída', id, lancamentosRemovidos: lancamentos.length })
  } catch (erro) {
    await conexao.rollback()
    console.log('Erro ao excluir investimento:', erro)
    res.status(500).json({ erro: 'Erro ao excluir caixinha.' })
  } finally {
    conexao.release()
  }
})

// ----------------------------------------------------------------------------
// Aportes e resgates
// ----------------------------------------------------------------------------

router.post('/:id/movimentos', async (req, res) => {
  const id = idValido(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  const { tipo, data } = req.body
  const valor = valorMonetario(req.body.valor)
  const dono = typeof req.body.dono === 'string' ? req.body.dono.trim() : ''
  const bancoId = req.body.bancoId ? idValido(req.body.bancoId) : null

  if (!['aporte', 'resgate'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' })
  if (!valor) return res.status(400).json({ erro: 'Valor inválido.' })
  if (!dataValida(data)) return res.status(400).json({ erro: 'Data inválida.' })
  if (data > hojeIso()) return res.status(400).json({ erro: 'A data não pode estar no futuro.' })
  if (!dono || dono.length > 60) return res.status(400).json({ erro: 'Informe de quem é o dinheiro.' })
  if (req.body.bancoId && !bancoId) return res.status(400).json({ erro: 'Conta inválida.' })

  try {
    const [investimento] = await carregarDoUsuario(req.usuarioId, id)
    if (!investimento) return res.status(404).json({ erro: 'Caixinha não encontrada.' })
    if (data < investimento.data_inicio) {
      return res.status(422).json({ erro: 'A data é anterior à criação da caixinha.' })
    }

    const novo = { id: Number.MAX_SAFE_INTEGER, tipo, valor, data, dono }
    const { resultado } = await validarMovimentos(
      investimento,
      [...investimento.movimentos, novo],
      investimento.conferencias,
    )

    if (resultado.erros.length) {
      return res.status(422).json({ erro: `Saldo insuficiente de ${dono} nessa data para resgatar esse valor.` })
    }

    const resgate = resultado.resgates.find((item) => item.movimentoId === novo.id)

    const conexao = await pool.getConnection()
    try {
      await conexao.beginTransaction()

      if (bancoId && !(await bancoDoUsuario(conexao, req.usuarioId, bancoId))) {
        await conexao.rollback()
        return res.status(400).json({ erro: 'Conta não encontrada.' })
      }

      // Resgate cai na conta pelo valor líquido (depois de IOF e IR).
      const lancamentoId = bancoId
        ? await criarLancamentoVinculado(conexao, req.usuarioId, {
            bancoId,
            tipo: tipo === 'aporte' ? 'despesa' : 'ganho',
            valor: tipo === 'aporte' ? valor : resgate.liquido,
            data,
            descricao: `${tipo === 'aporte' ? 'Aporte' : 'Resgate'}: ${investimento.nome}`,
          })
        : null

      const [inserido] = await conexao.query(
        `INSERT INTO investimento_movimentos (investimento_id, usuarioId, tipo, valor, data, dono, lancamento_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, req.usuarioId, tipo, valor, data, dono, lancamentoId],
      )

      await conexao.commit()
      res.status(201).json({
        mensagem: tipo === 'aporte' ? 'Aporte registrado' : 'Resgate registrado',
        id: inserido.insertId,
        lancamentoId,
        resgate: resgate || null,
      })
    } catch (erro) {
      await conexao.rollback()
      throw erro
    } finally {
      conexao.release()
    }
  } catch (erro) {
    console.log('Erro ao registrar movimentação:', erro)
    res.status(500).json({ erro: 'Erro ao registrar movimentação.' })
  }
})

router.delete('/:id/movimentos/:movimentoId', async (req, res) => {
  const id = idValido(req.params.id)
  const movimentoId = idValido(req.params.movimentoId)
  if (!id || !movimentoId) return res.status(400).json({ erro: 'ID inválido.' })

  try {
    const [investimento] = await carregarDoUsuario(req.usuarioId, id)
    if (!investimento) return res.status(404).json({ erro: 'Caixinha não encontrada.' })

    const movimento = investimento.movimentos.find((mov) => mov.id === movimentoId)
    if (!movimento) return res.status(404).json({ erro: 'Movimentação não encontrada.' })

    const restantes = investimento.movimentos.filter((mov) => mov.id !== movimentoId)
    const { resultado } = await validarMovimentos(investimento, restantes, investimento.conferencias)
    if (resultado.erros.length) {
      return res.status(422).json({
        erro: 'Não dá para excluir: um resgate posterior ficaria maior que o saldo. Exclua o resgate primeiro.',
      })
    }

    const conexao = await pool.getConnection()
    try {
      await conexao.beginTransaction()
      await conexao.query('DELETE FROM investimento_movimentos WHERE id = ? AND usuarioId = ?', [movimentoId, req.usuarioId])
      if (movimento.lancamento_id) {
        await conexao.query('DELETE FROM lancamentos WHERE id = ? AND usuarioId = ?', [movimento.lancamento_id, req.usuarioId])
      }
      await conexao.commit()
    } catch (erro) {
      await conexao.rollback()
      throw erro
    } finally {
      conexao.release()
    }

    res.json({ mensagem: 'Movimentação excluída', id: movimentoId, lancamentoRemovido: movimento.lancamento_id || null })
  } catch (erro) {
    console.log('Erro ao excluir movimentação:', erro)
    res.status(500).json({ erro: 'Erro ao excluir movimentação.' })
  }
})

// ----------------------------------------------------------------------------
// Conferência com o saldo do banco
// ----------------------------------------------------------------------------

router.post('/:id/conferencias', async (req, res) => {
  const id = idValido(req.params.id)
  if (!id) return res.status(400).json({ erro: 'ID inválido.' })

  const { data } = req.body
  const saldoBruto = valorMonetario(req.body.saldo_bruto)
  if (!dataValida(data)) return res.status(400).json({ erro: 'Data inválida.' })
  if (data > hojeIso()) return res.status(400).json({ erro: 'A data não pode estar no futuro.' })
  if (!saldoBruto) return res.status(400).json({ erro: 'Saldo bruto inválido.' })

  try {
    const [investimento] = await carregarDoUsuario(req.usuarioId, id)
    if (!investimento) return res.status(404).json({ erro: 'Caixinha não encontrada.' })

    const temSaldoAntes = investimento.movimentos.some((mov) => mov.tipo === 'aporte' && mov.data <= data)
    if (!temSaldoAntes) {
      return res.status(422).json({ erro: 'Registre um aporte antes dessa data para poder conferir o saldo.' })
    }

    await pool.query(
      `INSERT INTO investimento_conferencias (investimento_id, usuarioId, data, saldo_bruto)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE saldo_bruto = VALUES(saldo_bruto)`,
      [id, req.usuarioId, data, saldoBruto],
    )

    res.status(201).json({ mensagem: 'Saldo conferido' })
  } catch (erro) {
    console.log('Erro ao salvar conferência:', erro)
    res.status(500).json({ erro: 'Erro ao salvar conferência.' })
  }
})

router.delete('/:id/conferencias/:conferenciaId', async (req, res) => {
  const id = idValido(req.params.id)
  const conferenciaId = idValido(req.params.conferenciaId)
  if (!id || !conferenciaId) return res.status(400).json({ erro: 'ID inválido.' })

  try {
    const [resultado] = await pool.query(
      'DELETE FROM investimento_conferencias WHERE id = ? AND investimento_id = ? AND usuarioId = ?',
      [conferenciaId, id, req.usuarioId],
    )
    if (resultado.affectedRows === 0) return res.status(404).json({ erro: 'Conferência não encontrada.' })
    res.json({ mensagem: 'Conferência excluída', id: conferenciaId })
  } catch (erro) {
    console.log('Erro ao excluir conferência:', erro)
    res.status(500).json({ erro: 'Erro ao excluir conferência.' })
  }
})

module.exports = router
