-- =============================================
-- Migration: criação da tabela notificacoes
-- =============================================

CREATE TABLE IF NOT EXISTS notificacoes (
  id              SERIAL PRIMARY KEY,
  usuario_cpf     VARCHAR(11)   NOT NULL,

  -- Tipo da notificação
  -- Valores: AGENDAMENTO_CRIADO |
  --          AGENDAMENTO_CONFIRMADO |
  --          AGENDAMENTO_CANCELADO |
  --          LEMBRETE
  tipo            VARCHAR(50)   NOT NULL,

  titulo          VARCHAR(100)  NOT NULL,
  mensagem        TEXT          NOT NULL,
  lida            BOOLEAN       DEFAULT FALSE,

  -- Referência ao agendamento gerador
  referencia_id   INTEGER,
  referencia_tipo VARCHAR(20),  -- 'PIERCING' ou 'TATUAGEM'

  criada_em       TIMESTAMP     DEFAULT NOW()
);

-- Índice para busca por usuário
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario
ON notificacoes(usuario_cpf);

-- Índice parcial para não-lidas
-- (consulta mais frequente)
CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas
ON notificacoes(usuario_cpf, lida)
WHERE lida = FALSE;
