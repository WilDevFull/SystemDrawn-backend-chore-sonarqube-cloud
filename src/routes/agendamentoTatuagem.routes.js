const { Router } = require('express');
const agendamentoController = require('../controllers/agendamentoTatuagem.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/', authenticate, agendamentoController.criar);

router.get('/', authenticate, agendamentoController.listar);

// Relacionamentos - precisam vir ANTES de /:id
router.get('/proximos', authenticate, agendamentoController.listarProximos);
router.get('/historico', authenticate, agendamentoController.listarHistorico);

// CRUD por ID
router.get('/:id', authenticate, agendamentoController.buscarPorId);
router.put('/:id', authenticate, agendamentoController.atualizar);
router.delete('/:id', authenticate, agendamentoController.remover);

module.exports = router;