# Verification Ingestion Mini System

A mini, multi-service verification platform that orchestrates identity checks, billing, auditing, and async processing. It is built as three Node.js services backed by MongoDB, PostgreSQL, Redis, RabbitMQ, Elasticsearch, and OpenTelemetry tracing.

## What This Repository Contains

- **Verification Gateway**: Public API for verification requests, job tracking, caching, webhook handling, and search indexing.
- **Gov Provider**: Simulated government identity provider that performs checks and calls back via webhooks.
- **Billing Service**: Wallet/transaction handling and gRPC billing interface.
- **Shared**: Shared constants, retry policy, and tests used across services.

## Architecture at a Glance

- **HTTP APIs**
  - Verification Gateway and Gov Provider expose REST endpoints.
- **Async Processing**
  - RabbitMQ queues for verification jobs, retries, and DLQs.
  - Workers process jobs and manage retry/refund flows.
- **Data Stores**
  - MongoDB for verification logs and gov-provider data.
  - PostgreSQL for billing data.
  - Redis for caching and rate limiting.
  - Elasticsearch for indexing verification logs.
- **Observability**
  - OpenTelemetry instrumentation with Jaeger as the trace backend.

## Services and Ports

| Service | Default Port(s) | Description |
| --- | --- | --- |
| Verification Gateway | 3000 | API gateway, job orchestration, caching, search indexing |
| Gov Provider | 3001 | Simulated identity provider APIs |
| Billing Service | 3002, 50051 (gRPC) | Billing API and gRPC server |
| RabbitMQ | 5672, 15672 | Messaging backbone and management UI |
| MongoDB | 27017 | Primary document store |
| PostgreSQL | 5432 | Billing store |
| Redis | 6380, 6381, 6382 | Per-service caching and rate limiting |
| Elasticsearch | 9200 | Search index for verification logs |
| Jaeger | 16686, 4317 | Tracing UI and OTLP endpoint |

## Repository Layout

```
app/
  billing-service/
  gov-provider/
  verification-gateway/
  shared/
docker/
  docker-compose.yml
```

## Quick Start (Docker Compose)

1. Create a `.env` file in the repo root with the variables referenced by `docker/docker-compose.yml`:

```
MONGO_URI_GOV=mongodb://mongo:27017/gov-provider
MONGO_URI_GATEWAY=mongodb://mongo:27017/verification-gateway
GOV_PROVIDER_URL=http://gov-provider:3001
GOV_CLIENT_ID=gov-client-id
GOV_CLIENT_SECRET=gov-secret-key
```

2. Start the stack:

```bash
cd /home/<directory>/verification-ingestion-mini-system/docker
docker compose up --build
```

3. Health checks:

- Verification Gateway: `GET /health`, `GET /health/live`, `GET /health/ready`
- Gov Provider: `GET /health`
- Billing Service: `GET /health`, `GET /health/live`

## Local Development (Without Docker)

Each service runs independently with its own `package.json`:

```bash
cd /home/<directory>/verification-ingestion-mini-system/app/verification-gateway
npm install
npm run dev
```

```bash
cd /home/<directory>/verification-ingestion-mini-system/app/gov-provider
npm install
npm run dev
```

```bash
cd /home/<directory>/verification-ingestion-mini-system/app/billing-service
npm install
npm run dev
```

## Environment Variables

### Verification Gateway (`app/verification-gateway`)

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `MONGO_URI` | `mongodb://localhost:27017/verification-gateway` | Mongo connection |
| `GOV_PROVIDER_URL` | `http://gov-provider:3001` | Gov Provider base URL |
| `GOV_CLIENT_ID` | `gov-client-id` | Client ID for provider calls |
| `GOV_CLIENT_SECRET` | `gov-secret-key` | Client secret for provider calls |
| `REDIS_URL_GATEWAY` | none | Redis connection for caching |
| `RABBITMQ_URL` | `amqp://rabbitmq:5672` | RabbitMQ connection |
| `GATEWAY_BASE_URL` | none | Public base URL used in callbacks |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch node |
| `ELASTICSEARCH_CONNECT_RETRIES` | `10` | Connect attempts |
| `ELASTICSEARCH_CONNECT_DELAY_MS` | `1000` | Delay between attempts |
| `BILLING_GRPC_ADDR` | `billing-service:50051` | Billing gRPC address |
| `BILLING_GRPC_DEADLINE_MS` | `3000` | gRPC deadline |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP endpoint |
| `WEBHOOK_SECRET` | `simulated-signature` | HMAC secret for webhook verification |

### Gov Provider (`app/gov-provider`)

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3001` | HTTP server port |
| `MONGO_URI` | `mongodb://localhost:27017/gov-provider` | Mongo connection |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `5000` | Mongo connection tuning |
| `MONGO_SOCKET_TIMEOUT_MS` | `5000` | Mongo connection tuning |
| `MONGO_CONNECT_TIMEOUT_MS` | `5000` | Mongo connection tuning |
| `MONGO_BUFFER_TIMEOUT_MS` | `3000` | Mongo connection tuning |
| `REDIS_URL` | none | Redis connection |
| `RABBITMQ_URL` | `amqp://rabbitmq:5672` | RabbitMQ connection |
| `BILLING_GRPC_ADDR` | `billing-service:50051` | Billing gRPC address |
| `BILLING_GRPC_DEADLINE_MS` | `3000` | gRPC deadline |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP endpoint |
| `AUTH_DB_QUERY_TIMEOUT_MS` | `3000` | Auth query timeout |
| `RATE_LIMIT_REDIS_TIMEOUT_MS` | `500` | Redis timeout for rate limiting |

### Billing Service (`app/billing-service`)

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3002` | HTTP server port |
| `BILLING_POSTGRES_URI` or `POSTGRES_URI` | none | Postgres connection |
| `PG_POOL_ACQUIRE_TIMEOUT_MS` | `5000` | Postgres pool tuning |
| `PG_CONNECT_TIMEOUT_MS` | `5000` | Postgres pool tuning |
| `BILLING_REDIS_URL` or `REDIS_URL` | none | Redis connection |
| `BILLING_GRPC_BIND_ADDRESS` | `0.0.0.0:50051` | gRPC bind address |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP endpoint |

## Tests

Gov Provider and Verification Gateway use Node's built-in test runner:

```bash
cd /home/<directory>/verification-ingestion-mini-system/app/gov-provider
npm test
```

```bash
cd /home/<directory>/verification-ingestion-mini-system/app/verification-gateway
npm test
```

## Observability

Tracing is wired with OpenTelemetry and exports to Jaeger via OTLP. When using docker compose, the Jaeger UI is available at:

- `http://localhost:16686`

## Common Troubleshooting

- **RabbitMQ channel not available**: Ensure `rabbitmq` is running and reachable on `RABBITMQ_URL`.
- **Mongo connection timeouts**: Verify `MONGO_URI` values and container networking.
- **Elasticsearch not ready**: Wait for the container to initialize or raise `ELASTICSEARCH_CONNECT_RETRIES`.

## License

Add your license information here.

