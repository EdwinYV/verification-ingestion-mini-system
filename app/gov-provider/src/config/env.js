require('dotenv').config();

const isBlank = (value) => value === undefined || value === null || value === '';

const getString = (name, fallback) => {
  const value = process.env[name];
  if (isBlank(value)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getNumber = (name, fallback) => {
  const value = process.env[name];
  if (isBlank(value)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${name}`);
  }
  return parsed;
};

module.exports = {
  PORT: getNumber('PORT', 3001),
  MONGO_URI: getString('MONGO_URI', 'mongodb://localhost:27017/gov-provider'),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: getNumber('MONGO_SERVER_SELECTION_TIMEOUT_MS', 5000),
  MONGO_SOCKET_TIMEOUT_MS: getNumber('MONGO_SOCKET_TIMEOUT_MS', 5000),
  MONGO_CONNECT_TIMEOUT_MS: getNumber('MONGO_CONNECT_TIMEOUT_MS', 5000),
  MONGO_BUFFER_TIMEOUT_MS: getNumber('MONGO_BUFFER_TIMEOUT_MS', 3000),
  REDIS_URL: getString('REDIS_URL'),
  RABBITMQ_URL: getString('RABBITMQ_URL', 'amqp://rabbitmq:5672'),
  BILLING_GRPC_ADDR: getString('BILLING_GRPC_ADDR', 'billing-service:50051'),
  BILLING_GRPC_DEADLINE_MS: getNumber('BILLING_GRPC_DEADLINE_MS', 3000),
  OTEL_EXPORTER_OTLP_ENDPOINT: getString('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317'),
  AUTH_DB_QUERY_TIMEOUT_MS: getNumber('AUTH_DB_QUERY_TIMEOUT_MS', 3000),
  RATE_LIMIT_REDIS_TIMEOUT_MS: getNumber('RATE_LIMIT_REDIS_TIMEOUT_MS', 500),
};
