const { getChannel, GOV_QUEUE, publishToRetryQueue } = require('../config/rabbitmq');
const axios = require('axios');
const ninService = require('../modules/nin/service/nin.service');
const bvnService = require('../modules/bvn/service/bvn.service');
const passportService = require('../modules/passport/service/passport.service');
const dlService = require('../modules/drivers-license/service/dl.service');
const { VERIFICATION_TYPE } = require('../../../shared/constants/verification');
const { DEFAULT_MAX_RETRIES, getRetryDelayMs } = require('../../../shared/retry/policy');

const MAX_RETRIES = DEFAULT_MAX_RETRIES;

const startWorker = () => {
  const channel = getChannel();
  if (!channel) {
    console.error('RabbitMQ channel not available. Worker cannot start.');
    setTimeout(startWorker, 5000);
    return;
  }

  console.log('Gov Provider Verification worker started. Waiting for jobs...');

  channel.consume(GOV_QUEUE, async (msg) => {
    if (msg !== null) {
      const jobData = JSON.parse(msg.content.toString());
      const {
        type,
        id,
        mode,
        purpose,
        organizationId,
        idempotencyKey,
        callbackUrl,
        verificationId,
        retryCount = 0,
      } = jobData;
      const resolvedVerificationId = verificationId || idempotencyKey || `${type}:${id}`;

      try {
        let result = null;
        let error = null;

        try {
          const organization = { _id: organizationId };

          switch (type) {
            case VERIFICATION_TYPE.NIN:
              result = await ninService.verify(id, mode, purpose, organization, idempotencyKey);
              break;
            case VERIFICATION_TYPE.BVN:
              result = await bvnService.verify(id, mode, purpose, organization, idempotencyKey);
              break;
            case VERIFICATION_TYPE.PASSPORT:
              result = await passportService.verify(id, mode, purpose, organization, idempotencyKey);
              break;
            case VERIFICATION_TYPE.DRIVERS_LICENSE:
              result = await dlService.verify(id, mode, purpose, organization, idempotencyKey);
              break;
            default:
              throw new Error('Invalid verification type');
          }
        } catch (err) {
          console.error(`Verification logic failed for ${resolvedVerificationId}:`, err.message);
          error = err.message;
        }

        if (callbackUrl) {
          try {
            console.log(`Sending webhook to ${callbackUrl} for ${resolvedVerificationId}`);
            await axios.post(callbackUrl, {
              verificationId: resolvedVerificationId,
              status: error ? 'FAILED' : 'COMPLETED',
              data: result ? result.data : null,
              error: error
            }, {
              headers: { 'x-gov-signature': 'simulated-signature' }
            });
            console.log(`Webhook sent successfully for verification ${resolvedVerificationId}`);
            channel.ack(msg);
          } catch (webhookError) {
            console.error(`Failed to send webhook for ${resolvedVerificationId}:`, webhookError.message);
            throw new Error('Webhook delivery failed');
          }
        } else {
          console.warn(`No callbackUrl for job ${resolvedVerificationId}. Acknowledging message.`);
          channel.ack(msg);
        }
      } catch (processingError) {
        if (retryCount < MAX_RETRIES) {
          const delay = getRetryDelayMs(retryCount);
          console.log(`Retrying webhook for ${resolvedVerificationId} in ${delay}ms (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

          const nextJobData = { ...jobData, retryCount: retryCount + 1 };
          publishToRetryQueue(nextJobData, delay);

          channel.ack(msg);
        } else {
          console.error(`Webhook for ${resolvedVerificationId} failed permanently after ${MAX_RETRIES} retries.`);
          channel.nack(msg, false, false);
        }
      }
    }
  }, { noAck: false });
};

module.exports = { startWorker };
