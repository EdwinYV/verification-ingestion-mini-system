const { getChannel, SEARCH_INDEX_QUEUE, publishToSearchRetryQueue } = require('../config/rabbitmq');
const searchIndexService = require('../modules/audit/service/search-index.service');
const { extractTraceContext } = require('../utils/tracing.util');
const { context, trace, SpanStatusCode } = require('@opentelemetry/api');

const MAX_RETRIES = 5;
const tracer = trace.getTracer('verification-gateway');

const startSearchIndexWorker = () => {
  const channel = getChannel();
  if (!channel) {
    console.error('RabbitMQ channel not available. Search index worker cannot start.');
    setTimeout(startSearchIndexWorker, 5000);
    return;
  }

  console.log('Search index worker started. Waiting for index jobs...');

  channel.consume(SEARCH_INDEX_QUEUE, async (msg) => {
    if (msg !== null) {
      const headers = msg.properties?.headers || {};
      const jobData = JSON.parse(msg.content.toString());
      const { logId } = jobData;

      const ctx = extractTraceContext(headers);
      await context.with(ctx, async () => {
        const span = tracer.startSpan('search.index.consume', {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': SEARCH_INDEX_QUEUE,
            'verification.log_id': logId,
          },
        });

        try {
          await searchIndexService.indexById(logId);
          channel.ack(msg);
          span.setStatus({ code: SpanStatusCode.OK });
          console.log(`Search index updated for log ${logId}`);
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          console.error(`Error indexing log ${logId}:`, error.message);

          const retryCount = (jobData.retryCount || 0) + 1;
          if (retryCount <= MAX_RETRIES) {
            const delay = Math.pow(2, retryCount - 1) * 1000;
            publishToSearchRetryQueue(
              { ...jobData, retryCount },
              delay,
              { headers }
            );
            channel.ack(msg);
          } else {
            channel.nack(msg, false, false);
          }
        } finally {
          span.end();
        }
      });
    }
  }, { noAck: false });
};

module.exports = { startSearchIndexWorker };
