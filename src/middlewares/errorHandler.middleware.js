const { AppError } = require('../errors/AppError');

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError && err.isOperational) {
    console.warn(`[ErrorHandler] Erro operacional: ${err.statusCode} - ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  if (err.code === '23505') {
    console.warn('[ErrorHandler] Violação de unique constraint:', err.detail);
    return res.status(409).json({
      success: false,
      message: 'CPF já cadastrado.',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'JSON inválido no corpo da requisição.',
    });
  }

  console.error('[ErrorHandler] Erro inesperado:', err);

  return res.status(500).json({
    success: false,
    message: 'Erro interno do servidor. Tente novamente mais tarde.',
  });
};

module.exports = errorHandler;