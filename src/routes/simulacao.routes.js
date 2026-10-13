const express = require('express');
const router = express.Router();


const simulacaoController = require('../controllers/simulacao.controller');

router.post('/simular', simulacaoController.simularTatuagem);

module.exports = router;