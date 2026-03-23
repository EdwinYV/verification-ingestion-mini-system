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
  PORT: getNumber('PORT', 3000),
  MONGO_URI: getString('MONGO_URI', 'mongodb://localhost:27017/verification-gateway'),
  GOV_PROVIDER_URL: getString('GOV_PROVIDER_URL', 'http://gov-provider:3001'),
  GOV_CLIENT_ID: getString('GOV_CLIENT_ID', 'gov-client-id'),
  GOV_CLIENT_SECRET: getString('GOV_CLIENT_SECRET', 'gov-secret-key'),
  REDIS_URL_GATEWAY: getString('REDIS_URL_GATEWAY'),
  RABBITMQ_URL: getString('RABBITMQ_URL', 'amqp://rabbitmq:5672'),
  GATEWAY_BASE_URL: getString('GATEWAY_BASE_URL'),
  ELASTICSEARCH_URL: getString('ELASTICSEARCH_URL', 'http://localhost:9200'),
  ELASTICSEARCH_CONNECT_RETRIES: getNumber('ELASTICSEARCH_CONNECT_RETRIES', 10),
  ELASTICSEARCH_CONNECT_DELAY_MS: getNumber('ELASTICSEARCH_CONNECT_DELAY_MS', 1000),
  BILLING_GRPC_ADDR: getString('BILLING_GRPC_ADDR', 'billing-service:50051'),
  BILLING_GRPC_DEADLINE_MS: getNumber('BILLING_GRPC_DEADLINE_MS', 3000),
  OTEL_EXPORTER_OTLP_ENDPOINT: getString('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317'),
  WEBHOOK_SECRET: getString('WEBHOOK_SECRET', 'simulated-signature'),
};
