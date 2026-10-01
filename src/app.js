require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Rotas do projeto (A sua + A da equipe)
const authRoutes = require('./routes/auth.routes');
const agendamentoRoutes = require('./routes/agendamentoTatuagem.routes');
const agendamentoPiercingRoutes = require('./routes/agendamentoPiercing.routes');
const tiposPiercingRoutes = require('./routes/tiposPiercing.routes');
const joiaPiercingRoutes = require('./routes/joiaPiercing.routes');
const notificacoesRoutes = require('./routes/notificacoes');
const estilosTatuagemRoutes = require('./routes/estilosTatuagem.routes'); // <-- A SUA ROTA AQUI

// Middlewares
const { authenticate } = require('./middlewares/auth.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');

const app = express();

app.use(helmet());
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Muitas requisições. Tente novamente em 15 minutos.',
  },
});

app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health Check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SystemDrawn API está online.',
    env: process.env.NODE_ENV || 'development',
  });
});

// Endpoints principais (A sua + A da equipe)
app.use('/auth', authRoutes);
app.use('/agendamentos-tatuagem', agendamentoRoutes);
app.use('/agendamentos-piercing', agendamentoPiercingRoutes);
app.use('/tipos-piercing', tiposPiercingRoutes);
app.use('/joias-piercing', joiaPiercingRoutes);
app.use('/notificacoes', authenticate, notificacoesRoutes);
app.use('/estilos-tatuagem', estilosTatuagemRoutes); // <-- O SEU ENDPOINT AQUI

// Middleware 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada.',
  });
});

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[SystemDrawn] Servidor rodando na porta ${PORT}`);
  });
}

module.exports = app;