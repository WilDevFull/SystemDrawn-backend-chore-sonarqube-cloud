const repository =
  require(
    '../repositories/joiaPiercing.repository'
  );

const {
  AppError,
} = require(
  '../errors/AppError'
);

/**
 * Criar joia
 */
const criar =
  async (dados) => {
    return await repository.create(
      dados
    );
  };

/**
 * Listar todas
 */
const listar =
  async () => {
    return await repository.findAll();
  };

/**
 * Buscar por id
 */
const buscarPorId =
  async (id) => {
    const joia =
      await repository.findById(
        id
      );

    if (!joia) {
      throw new AppError(
        'Joia não encontrada.',
        404
      );
    }

    return joia;
  };

/**
 * Atualizar
 */
const atualizar =
  async (
    id,
    dados
  ) => {
    await buscarPorId(id);

    return await repository.update(
      id,
      dados
    );
  };

/**
 * Remover
 */
const remover =
  async (id) => {
    await buscarPorId(id);

    return await repository.remove(
      id
    );
  };

/**
 * Relacionamento
 * listar joias
 * por tipo piercing
 */
const listarPorTipoPiercing =
  async (
    tipoPiercingId
  ) => {
    return await repository.findByTipoPiercing(
      tipoPiercingId
    );
  };

module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  remover,
  listarPorTipoPiercing,
};