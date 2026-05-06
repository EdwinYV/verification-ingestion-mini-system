const { publishToQueue } = require('../../../config/rabbitmq');
const asyncHandler = require('../../../utils/asyncHandler');

const createVerificationHandler = (type) => {
  return asyncHandler(async (req, res) => {
    const { id, mode, purpose, callbackUrl, verificationId } = req.body;
    const organization = req.organization;
    const idempotencyKey = req.headers['x-idempotency-key'];

    const jobData = {
      type,
      id,
      mode,
      purpose,
      organizationId: organization._id,
      idempotencyKey,
      callbackUrl,
      verificationId,
    };

    publishToQueue(jobData);

    res.status(202).json({
      status: 'PENDING',
      message: 'Verification request accepted. Result will be sent to callbackUrl.',
    });
  });
};

module.exports = {
  createVerificationHandler,
};

