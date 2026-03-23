const { publishToQueue } = require('../../../config/rabbitmq');
const asyncHandler = require('../../../utils/asyncHandler');

exports.verifyNIN = asyncHandler(async (req, res) => {
  console.log('[DEBUG] NIN Controller: Request received');
  const { id, mode, purpose, callbackUrl, verificationId } = req.body;
  const organization = req.organization;
  const idempotencyKey = req.headers['x-idempotency-key'];

  const jobData = {
    type: 'NIN',
    id,
    mode,
    purpose,
    organizationId: organization._id,
    idempotencyKey,
    callbackUrl,
    verificationId,
  };

  console.log('[DEBUG] NIN Controller: Publishing to queue...');
  publishToQueue(jobData);
  console.log('[DEBUG] NIN Controller: Published to queue.');

  res.status(202).json({
    status: 'PENDING',
    message: 'Verification request accepted. Result will be sent to callbackUrl.',
  });
});
