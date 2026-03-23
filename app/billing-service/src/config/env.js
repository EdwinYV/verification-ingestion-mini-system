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

const getStringFromList = (names) => {
  for (const name of names) {
    const value = process.env[name];
    if (!isBlank(value)) {
      return value;
    }
  }
  throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
};

module.exports = {
  PORT: getNumber('PORT', 3002),
  BILLING_POSTGRES_URI: getStringFromList(['BILLING_POSTGRES_URI', 'POSTGRES_URI']),
  PG_POOL_ACQUIRE_TIMEOUT_MS: getNumber('PG_POOL_ACQUIRE_TIMEOUT_MS', 5000),
  PG_CONNECT_TIMEOUT_MS: getNumber('PG_CONNECT_TIMEOUT_MS', 5000),
  BILLING_REDIS_URL: getStringFromList(['BILLING_REDIS_URL', 'REDIS_URL']),
  BILLING_GRPC_BIND_ADDRESS: getString('BILLING_GRPC_BIND_ADDRESS', '0.0.0.0:50051'),
  OTEL_EXPORTER_OTLP_ENDPOINT: getString('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317'),
};
