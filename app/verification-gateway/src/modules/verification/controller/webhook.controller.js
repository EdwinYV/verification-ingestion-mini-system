const verificationService = require('../service/verification.service');
const asyncHandler = require('../../../utils/asyncHandler');
const { BadRequestError, UnauthorizedError } = require('../../../../../shared/errors');
const { verifyWebhookSignature } = require('../../../utils/hmac.util');

exports.handleGovProviderWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-gov-signature'];

  if (!verifyWebhookSignature(req.body, signature)) {
    throw new UnauthorizedError('Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  const { verificationId } = req.body;
  if (!verificationId) {
    throw new BadRequestError('Missing verificationId in webhook payload', 'INVALID_PAYLOAD');
  }

  console.log(`Received webhook for verification ${verificationId}`);

  await verificationService.handleWebhook(req.body);

  res.status(200).json({ status: 'success', message: 'Webhook processed' });
});