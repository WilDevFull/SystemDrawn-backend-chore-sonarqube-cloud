const { Router } = require('express');
const tiposPiercingController = require('../controllers/tiposPiercing.controller');

const {
  authenticate,
} = require('../middlewares/auth.middleware');

const routes = Router();

/**
 * Protege todas as rotas
 */
routes.use(authenticate);

/**
 * CRUD
 */
routes.get('/', tiposPiercingController.getAll);
routes.get('/:id', tiposPiercingController.getById);
routes.post('/', tiposPiercingController.create);
routes.put('/:id', tiposPiercingController.update);
routes.delete('/:id', tiposPiercingController.delete);
module.exports = routes;