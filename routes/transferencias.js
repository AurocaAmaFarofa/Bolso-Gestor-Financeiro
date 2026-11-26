// Transferência entre contas do próprio usuário. Grava a saída e a entrada
// juntas (ou nenhuma), ligadas pelo mesmo grupoId. Para excluir, basta apagar
// uma das pontas em DELETE /lancamentos/:id.

const crypto = require('crypto')
const express = require('express')
const router = express.Router()

const pool = require('../db/connections')
const exigirLogin = require('../middleware/auth')
const { CATEGORIA_TRANSFERENCIA, garantirCategoria } = require('../lib/categorias')
const {
  garantirEsquemaLancamentos,
  lerId,
  lerValor,
  lerData,
  lerDescricao,
  emTransacao,
  inserirLancamento,
} = require('../lib/lancamentos')

router.post('/', exigirLogin, async (req, res) => {
  const corpo = req.body || {}
  const origemId = lerId(corpo.bancoOrigemId)
  const destinoId = lerId(corpo.bancoDestinoId)
  const valor = lerValor(corpo.valor)
  const data = lerData(corpo.data)
  const descricao = lerDescricao(corpo.descricao)

  if (!origemId || !destinoId) return res.status(400).json({ erro: 'Escolha a conta de origem e a de destino.' })
  if (origemId === destinoId) return res.status(400).json({ erro: 'A conta de destino precisa ser diferente da de origem.' })
  if (valor === null) return res.status(400).json({ erro: 'Valor inválido.' })
  if (data === null) return res.status(400).json({ erro: 'Data inválida.' })
  if (descricao === null) return res.status(400).json({ erro: 'Descrição muito longa.' })

  try {
    await garantirEsquemaLancamentos()

    const [contas] = await pool.query(
      'SELECT id, nome FROM bancos WHERE usuarioId = ? AND id IN (?, ?)',
      [req.usuarioId, origemId, destinoId],
    )
    const origem = contas.find((conta) => conta.id === origemId)
    const destino = contas.find((conta) => conta.id === destinoId)
    if (!origem || !destino) return res.status(400).json({ erro: 'Conta não encontrada.' })

    const categoria = await garantirCategoria(pool, req.usuarioId, CATEGORIA_TRANSFERENCIA)
    const comum = {
      valor,
      categoria,
      data,
      forma: 'transferencia',
      descricao: descricao || `Transferência de ${origem.nome} para ${destino.nome}`.slice(0, 255),
      grupoId: crypto.randomUUID(),
    }

    const lancamentos = await emTransacao(async (conexao) => [
      await inserirLancamento(conexao, req.usuarioId, { ...comum, tipo: 'despesa', bancoId: origemId }),
      await inserirLancamento(conexao, req.usuarioId, { ...comum, tipo: 'ganho', bancoId: destinoId }),
    ])

    res.status(201).json({ mensagem: 'Transferência registrada', lancamentos })
  } catch (erro) {
    console.log('Erro ao registrar transferência:', erro)
    res.status(500).json({ erro: 'Erro ao registrar transferência.' })
  }
})

module.exports = router
