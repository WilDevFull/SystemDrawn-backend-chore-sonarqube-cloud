const authService = require('../services/auth.service');
const { validateAndSanitizeCpf, validateNomeCompleto } = require('../validations/auth.validation');

const checkCpf = async (req, res, next) => {
  try {
    const cpf = validateAndSanitizeCpf(req.body.cpf);
    const result = await authService.checkCpf(cpf);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const cpf = validateAndSanitizeCpf(req.body.cpf);
    const nomeCompleto = validateNomeCompleto(req.body.nomeCompleto);

    const result = await authService.register(cpf, nomeCompleto);

    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const cpf = validateAndSanitizeCpf(req.body.cpf);
    const result = await authService.login(cpf);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const usuario = await authService.getMe(req.user.cpf);

    return res.status(200).json({ success: true, usuario });
  } catch (error) {
    next(error);
  }
};

module.exports = { checkCpf, register, login, getMe };