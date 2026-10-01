const repository =
  require(
    '../repositories/agendamentoPiercing.repository'
  );

const {
  AppError,
} = require(
  '../errors/AppError'
);

const notificacaoService =
  require(
    './notificacao.service'
  );

/**
 * Criar agendamento
 */
const criar = async (
  usuarioCpf,
  dados
) => {

  /**
   * Busca tipo piercing
   * pelo ID
   */
  const tipoPiercing =
    await repository.buscarTipoPorId(
      dados.tipo_piercing_id
    );

  if (!tipoPiercing) {
    throw new AppError(
      'Tipo de piercing não encontrado.',
      404
    );
  }

  /**
   * Busca joia pelo ID
   */
  const joia =
    await repository.buscarJoiaPorId(
      dados.joia_piercing_id
    );

  if (!joia) {
    throw new AppError(
      'Joia não encontrada.',
      404
    );
  }

  /**
   * Verifica horário ocupado
   */
  const horarioExiste =
    await repository.verificarHorario(
      dados.data,
      dados.horario
    );

  if (horarioExiste) {
    throw new AppError(
      'Este horário já está ocupado.',
      409
    );
  }

  /**
   * Novo agendamento
   */
  const novoAgendamento = {
    usuarioCpf,

    tipoPiercingId:
      tipoPiercing.id,

    joiaPiercingId:
      joia.id,

    observacao:
      dados.observacao || '',

    data:
      dados.data,

    horario:
      dados.horario,

    status:
      'pendente',
  };

  /**
   * Salva no banco
   */
  const agendamento =
    await repository.create(
      novoAgendamento
    );

  /**
   * Notificação
   */
  await notificacaoService
    .criarParaAgendamento(
      usuarioCpf,
      'PIERCING',
      'AGENDAMENTO_CRIADO',
      {
        data:
          agendamento.data,

        horario:
          agendamento.horario,

        agendamentoId:
          agendamento.id,
      }
    );

  return agendamento;
};

/**
 * Listar por usuário
 */
const listarPorUsuario =
  async (
    usuarioCpf
  ) => {

    return await repository
      .findByUsuario(
        usuarioCpf
      );
  };

/**
 * Buscar por ID
 */
const buscarPorId =
  async (
    id,
    usuarioCpf
  ) => {

    const agendamento =
      await repository.findById(
        id
      );

    if (
      !agendamento ||
      agendamento.usuario_cpf !==
        usuarioCpf
    ) {

      throw new AppError(
        'Agendamento não encontrado.',
        404
      );
    }

    return agendamento;
  };

/**
 * Atualizar / Reagendar
 */
const atualizar =
  async (
    id,
    usuarioCpf,
    dados
  ) => {

    const existente =
      await buscarPorId(
        id,
        usuarioCpf
      );

    /**
     * Verifica conflito
     * somente se mudou
     * data ou horário
     */
    const mudouHorario =
      dados.data ||
      dados.horario;

    if (
      mudouHorario
    ) {

      const ocupado =
        await repository.verificarHorario(
          dados.data ||
            existente.data,

          dados.horario ||
            existente.horario
        );

      /**
       * Evita conflito
       * consigo mesmo
       */
      if (
        ocupado &&
        ocupado.id !== id
      ) {

        throw new AppError(
          'Este horário já está ocupado.',
          409
        );
      }
    }

    /**
     * Atualizado
     */
    const atualizado = {
      ...existente,
      ...dados,
    };

    /**
     * Salvar
     */
    const resultado =
      await repository.update(
        id,
        atualizado
      );

    /**
     * Notificação
     */
    await notificacaoService
      .criarParaAgendamento(
        usuarioCpf,
        'PIERCING',
        'AGENDAMENTO_CONFIRMADO',
        {
          data:
            resultado.data,

          horario:
            resultado.horario,

          agendamentoId:
            resultado.id,
        }
      );

    return resultado;
  };

/**
 * Remover
 */
const remover =
  async (
    id,
    usuarioCpf
  ) => {

    const agendamento =
      await buscarPorId(
        id,
        usuarioCpf
      );

    /**
     * Remove
     */
    await repository.remove(
      id
    );

    /**
     * Notificação
     */
    await notificacaoService
      .criarParaAgendamento(
        usuarioCpf,
        'PIERCING',
        'AGENDAMENTO_CANCELADO',
        {
          data:
            agendamento.data,

          horario:
            agendamento.horario,
        }
      );

    return true;
  };

/**
 * Próximos
 */
const listarProximos =
  async (
    usuarioCpf
  ) => {

    return await repository
      .findProximos(
        usuarioCpf
      );
  };

/**
 * Histórico
 */
const listarHistorico =
  async (
    usuarioCpf
  ) => {

    return await repository
      .findHistorico(
        usuarioCpf
      );
  };

module.exports = {
  criar,
  listarPorUsuario,
  buscarPorId,
  atualizar,
  remover,
  listarProximos,
  listarHistorico,
};

