const { verifyToken } = require('../utils/jwt.util');
const { AppError } = require('../errors/AppError');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError('Token de autenticação não fornecido.', 401);
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Formato do token inválido. Use: Bearer <token>', 401);
    }

    const token = parts[1];

    if (!token || token.trim() === '') {
      throw new AppError('Token de autenticação não fornecido.', 401);
    }

    const decoded = verifyToken(token);

    req.user = {
      cpf: decoded.cpf,
      nomeCompleto: decoded.nomeCompleto,
    };

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate };