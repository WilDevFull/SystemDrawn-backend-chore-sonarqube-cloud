const notificacaoRepository =
  require(
    '../repositories/notificacao.repository'
  );

const { AppError } =
  require(
    '../errors/AppError'
  );

/**
 * Criar notificação manual
 */
const criar =
  async (dados) => {
    return await notificacaoRepository
      .create(dados);
  };

/**
 * Criar notificação automática
 * para agendamentos
 */
const criarParaAgendamento =
  async (
    usuarioCpf,
    tipoServico,
    evento,
    dados
  ) => {

    let titulo =
      '';

    let mensagem =
      '';

    /**
     * Tipo do ENUM
     * do PostgreSQL
     */
    let tipo =
      'appointment_reminder';

    /**
     * Agendamento criado
     */
    if (
      evento ===
      'AGENDAMENTO_CRIADO'
    ) {

      titulo =
        `${tipoServico} agendado`;

      mensagem =
        `Seu ${tipoServico.toLowerCase()} foi agendado para ${dados.data} às ${dados.horario}.`;

      tipo =
        'appointment_confirmed';
    }

    /**
     * Agendamento cancelado
     */
    if (
      evento ===
      'AGENDAMENTO_CANCELADO'
    ) {

      titulo =
        `${tipoServico} cancelado`;

      mensagem =
        `Seu ${tipoServico.toLowerCase()} foi cancelado.`;

      tipo =
        'appointment_cancelled';
    }

    /**
     * Agendamento confirmado
     */
    if (
      evento ===
      'AGENDAMENTO_CONFIRMADO'
    ) {

      titulo =
        `${tipoServico} confirmado`;

      mensagem =
        `Seu ${tipoServico.toLowerCase()} foi confirmado para ${dados.data} às ${dados.horario}.`;

      tipo =
        'appointment_confirmed';
    }

    /**
     * Criar no banco
     */
    return await notificacaoRepository
      .create({
        usuarioCpf,
        tipo,
        titulo,
        mensagem,
      });
  };

/**
 * Listar todas
 */
const listar =
  async (cpf) => {
    return await notificacaoRepository
      .findByUsuario(cpf);
  };

/**
 * Listar não lidas
 */
const listarNaoLidas =
  async (cpf) => {
    return await notificacaoRepository
      .findNaoLidas(cpf);
  };

/**
 * Marcar como lida
 */
const marcarComoLida =
  async (id, cpf) => {

    const notificacao =
      await notificacaoRepository
        .marcarComoLida(
          id,
          cpf
        );

    if (!notificacao) {
      throw new AppError(
        'Notificação não encontrada.',
        404
      );
    }

    return notificacao;
  };

/**
 * Marcar todas como lidas
 */
const marcarTodasComoLidas =
  async (cpf) => {
    return await notificacaoRepository
      .marcarTodasComoLidas(
        cpf
      );
  };

/**
 * Contar não lidas
 */
const contarNaoLidas =
  async (cpf) => {
    return await notificacaoRepository
      .contarNaoLidas(
        cpf
      );
  };

/**
 * Remover notificação
 */
const remover =
  async (id, cpf) => {

    const notificacoes =
      await notificacaoRepository
        .findByUsuario(cpf);

    const existe =
      notificacoes.find(
        (n) => n.id === id
      );

    if (!existe) {
      throw new AppError(
        'Notificação não encontrada.',
        404
      );
    }

    await notificacaoRepository
      .remove(
        id,
        cpf
      );

    return true;
  };

module.exports = {
  criar,
  criarParaAgendamento,
  listar,
  listarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
  contarNaoLidas,
  remover,
};