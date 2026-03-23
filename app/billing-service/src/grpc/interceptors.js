const { context, propagation, trace, SpanStatusCode } = require('@opentelemetry/api');
const { metadataToCarrier, mapDomainError } = require('./utils');

const tracer = trace.getTracer('billing-service-grpc');

async function withGrpcTrace(call, rpcName, fn, callback) {
  const extracted = propagation.extract(context.active(), metadataToCarrier(call.metadata));

  await context.with(extracted, async () => {
    const span = tracer.startSpan(`grpc.${rpcName}`);
    try {
      const response = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      callback(null, response);
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      callback(error.code && typeof error.code === 'number' ? error : mapDomainError(error));
    } finally {
      span.end();
    }
  });
}

module.exports = { withGrpcTrace };
