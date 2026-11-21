// Garante as estruturas de cartões de crédito no banco (o mesmo SQL está em
// db/migracao_cartoes.sql). Roda uma vez por processo; se falhar, tenta de novo
// na próxima requisição.

const pool = require('../db/connections')

const SQL_TABELAS = [
  `CREATE TABLE IF NOT EXISTS cartoes (
    id INT NOT NULL AUTO_INCREMENT,
    usuarioId INT NOT NULL,
    bancoId INT NOT NULL,
    nome VARCHAR(80) NOT NULL,
    dia_fechamento TINYINT NOT NULL,
    dia_vencimento TINYINT NOT NULL,
    limite DECIMAL(12,2) DEFAULT NULL,
    reservar_fatura TINYINT(1) NOT NULL DEFAULT 0,
    criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cartoes_usuario (usuarioId),
    KEY idx_cartoes_banco (bancoId),
    CONSTRAINT fk_cartoes_usuario FOREIGN KEY (usuarioId) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT chk_cartoes_fechamento CHECK (dia_fechamento BETWEEN 1 AND 31),
    CONSTRAINT chk_cartoes_vencimento CHECK (dia_vencimento BETWEEN 1 AND 31)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS fatura_pagamentos (
    id INT NOT NULL AUTO_INCREMENT,
    usuarioId INT NOT NULL,
    cartaoId INT NOT NULL,
    fatura_mes VARCHAR(7) NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    data DATE NOT NULL,
    bancoId INT NOT NULL,
    criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pagamentos_cartao (cartaoId),
    CONSTRAINT fk_pagamentos_cartao FOREIGN KEY (cartaoId) REFERENCES cartoes (id) ON DELETE CASCADE,
    CONSTRAINT chk_pagamentos_valor CHECK (valor > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]

let pronto = null

async function colunaExiste(tabela, coluna) {
  const [linhas] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  )
  return Number(linhas[0].total) > 0
}

function garantirEsquemaCartoes() {
  if (!pronto) {
    pronto = (async () => {
      for (const sql of SQL_TABELAS) {
        await pool.query(sql)
      }
      if (!(await colunaExiste('lancamentos', 'cartaoId'))) {
        await pool.query(
          'ALTER TABLE lancamentos ADD COLUMN cartaoId INT DEFAULT NULL'
        )
      }
    })().catch((erro) => {
      pronto = null
      throw erro
    })
  }
  return pronto
}

module.exports = { garantirEsquemaCartoes }
