-- ============================================================
-- Bolso — Migração: Investimentos (caixinhas atreladas ao CDI)
-- Pode ser executado mais de uma vez (IF NOT EXISTS).
-- O app também cria estas tabelas sozinho no primeiro acesso a /investimentos.
-- ============================================================

CREATE TABLE IF NOT EXISTS investimentos (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS investimento_movimentos (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS investimento_conferencias (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cdi_diario (
  data DATE NOT NULL,
  taxa DECIMAL(12,8) NOT NULL,
  PRIMARY KEY (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
