const db = require('../config/database');

const findByCpf = async (cpf) => {
  const result = await db.query(
    'SELECT cpf, nome_completo, created_at, updated_at FROM usuarios WHERE cpf = $1',
    [cpf]
  );
  return result.rows[0] || null;
};

const create = async (cpf, nomeCompleto) => {
  const result = await db.query(
    `INSERT INTO usuarios (cpf, nome_completo, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     RETURNING cpf, nome_completo, created_at, updated_at`,
    [cpf, nomeCompleto]
  );
  return result.rows[0];
};

module.exports = { findByCpf, create };