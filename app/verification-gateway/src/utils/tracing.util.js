const { context, propagation } = require('@opentelemetry/api');

const injectTraceHeaders = () => {
  const carrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
};

const extractTraceContext = (headers = {}) => {
  return propagation.extract(context.active(), headers);
};

module.exports = {
  injectTraceHeaders,
  extractTraceContext,
};
