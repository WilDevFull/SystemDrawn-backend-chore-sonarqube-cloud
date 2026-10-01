const { Router } = require('express');
const controller = require('../controllers/joiaPiercing.controller');

const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

/**
 * CRUD
 */
router.post('/', authenticate, controller.criar);

router.get('/', authenticate, controller.listar);

/**
 * Relacionamento
 * Tipo piercing -> joias
 * PRECISA VIR ANTES DE /:id
 */
router.get(
  '/tipo-piercing/:tipoPiercingId',
  authenticate,
  controller.listarPorTipoPiercing
);

/**
 * CRUD por ID
 */
router.get('/:id', authenticate, controller.buscarPorId);

router.put('/:id', authenticate, controller.atualizar);

router.delete('/:id', authenticate, controller.remover);

module.exports = router;