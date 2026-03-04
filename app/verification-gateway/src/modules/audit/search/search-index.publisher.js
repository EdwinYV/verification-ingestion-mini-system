const { publishToSearchIndexQueue } = require('../../../config/rabbitmq');
const { injectTraceHeaders } = require('../../../utils/tracing.util');

const enqueueVerificationLogIndex = (logId, eventType = 'updated') => {
  publishToSearchIndexQueue(
    {
      logId,
      eventType,
      queuedAt: new Date().toISOString(),
    },
    { headers: injectTraceHeaders() }
  );
};

module.exports = {
  enqueueVerificationLogIndex,
};
