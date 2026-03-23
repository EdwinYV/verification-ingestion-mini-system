const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const env = require('../config/env');

const exporter = new OTLPTraceExporter({
  url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'billing-service',
  }),
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

Promise.resolve(sdk.start()).catch((error) => {
  console.error('OpenTelemetry initialization failed:', error);
});

process.on('SIGTERM', () => {
  sdk.shutdown().catch((error) => {
    console.error('OpenTelemetry shutdown failed:', error);
  });
});
