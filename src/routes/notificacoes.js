const { Router } =
  require('express');

const notificacaoController =
  require(
    '../controllers/notificacaoController'
  );

const router = Router();

/**
 * GET /notificacoes
 * Lista todas
 */
router.get(
  '/',
  notificacaoController.listar
);

/**
 * GET /notificacoes/nao-lidas
 * Lista não lidas
 *
 * IMPORTANTE: esta rota deve vir
 * ANTES de /:id para não conflitar
 */
router.get(
  '/nao-lidas',
  notificacaoController.listarNaoLidas
);

/**
 * GET /notificacoes/contador
 * Badge do sino no app
 */
router.get(
  '/contador',
  notificacaoController.contarNaoLidas
);

/**
 * PATCH /notificacoes/todas/lidas
 * Marcar todas como lidas
 *
 * IMPORTANTE: esta rota deve vir
 * ANTES de /:id/lida para não conflitar
 */
router.patch(
  '/todas/lidas',
  notificacaoController.marcarTodasComoLidas
);

/**
 * PATCH /notificacoes/:id/lida
 * Marcar uma como lida
 */
router.patch(
  '/:id/lida',
  notificacaoController.marcarComoLida
);

/**
 * DELETE /notificacoes/:id
 * Remover notificação
 */
router.delete(
  '/:id',
  notificacaoController.remover
);

module.exports = router;
