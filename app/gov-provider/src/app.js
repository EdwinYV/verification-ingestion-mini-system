const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { BaseError } = require('../../shared/errors');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'Gov Provider' });
});

// Mount all API routes
app.use('/api', routes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const isBaseError = err instanceof BaseError;
  const statusCode = isBaseError ? err.statusCode : 500;
  res.status(statusCode).json({
    status: 'error',
    code: isBaseError ? err.code : 'SERVER_ERROR',
    message: isBaseError ? err.message : 'Internal Server Error'
  });
});

module.exports = app;