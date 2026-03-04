const { getChannel, VERIFICATION_QUEUE, publishToRetryQueue } = require('../config/rabbitmq');
const verificationService = require('../modules/verification/service/verification.service');
const VerificationLog = require('../models/verification-log.model');
const billingService = require('../modules/billing/service/billing.service');
const { extractTraceContext } = require('../utils/tracing.util');
const { context, trace, SpanStatusCode } = require('@opentelemetry/api');

const MAX_RETRIES = 5;
const tracer = trace.getTracer('verification-gateway');

const startWorker = () => {
  const channel = getChannel();
  if (!channel) {
    console.error('RabbitMQ channel not available. Worker cannot start.');
    setTimeout(startWorker, 5000);
    return;
  }

  console.log('Verification worker started. Waiting for jobs...');

  channel.consume(VERIFICATION_QUEUE, async (msg) => {
    if (msg !== null) {
      const headers = msg.properties?.headers || {};
      const jobData = JSON.parse(msg.content.toString());
      const { logId, type, clientOrganizationId } = jobData;

      const ctx = extractTraceContext(headers);
      await context.with(ctx, async () => {
        const span = tracer.startSpan('verification.consume', {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': VERIFICATION_QUEUE,
            'verification.log_id': logId,
          },
        });

        try {
          await VerificationLog.findByIdAndUpdate(logId, { status: 'PROCESSING' });
          await verificationService.processVerificationJob(jobData);
          channel.ack(msg);
          span.setStatus({ code: SpanStatusCode.OK });
          console.log(`Job ${logId} processed successfully.`);
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          console.error(`Error processing job ${logId}:`, error.message);

          const log = await VerificationLog.findById(logId);
          const currentRetries = log.retryCount || 0;

          if (currentRetries < MAX_RETRIES) {
            const delay = Math.pow(2, currentRetries) * 1000;

            console.log(`Retrying job ${logId} in ${delay}ms (Attempt ${currentRetries + 1}/${MAX_RETRIES})`);

            await VerificationLog.findByIdAndUpdate(logId, { 
              status: 'PENDING', 
              retryCount: currentRetries + 1,
              errorMessage: `Processing failed. Retrying in ${delay}ms... (${error.message})`
            });

            publishToRetryQueue(jobData, delay, { headers });
            channel.ack(msg);
          } else {
            console.error(`Job ${logId} failed permanently after ${MAX_RETRIES} retries.`);

            await VerificationLog.findByIdAndUpdate(logId, {
              status: 'FAILED',
              errorMessage: `Verification failed after ${MAX_RETRIES} retries: ${error.message}`,
              completedAt: new Date(),
            });

            try {
              await billingService.refundWallet(clientOrganizationId, type.toUpperCase(), `refund_failed_${logId}`);
              console.log(`Refunded client for job ${logId}`);
            } catch (refundError) {
              console.error(`Failed to refund client for job ${logId}:`, refundError);
            }

            channel.nack(msg, false, false);
          }
        } finally {
          span.end();
        }
      });
    }
  }, { noAck: false });
};

module.exports = { startWorker };
