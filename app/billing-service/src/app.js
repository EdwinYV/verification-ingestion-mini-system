const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'billing-service' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'billing-service' });
});

module.exports = app;
