const verificationService = require('../service/verification.service');
const asyncHandler = require('../../../utils/asyncHandler');

exports.queueVerification = asyncHandler(async (req, res) => {
  const { type, id, mode, purpose } = req.body;
  const clientOrganization = req.clientOrganization;

  const idempotencyKey =
      req.headers['x-idempotency-key'] || req.body.idempotencyKey;

  const result = await verificationService.createVerificationJob({
    type,
    id,
    mode,
    purpose,
    clientOrganization,
    idempotencyKey
  });

  if (result.isDuplicate) {
    return res.status(200).json({
      status: result.job.status,
      message: 'This request has already been processed. Returning existing status.',
      verificationId: result.job._id,
      identity: result.job.searchId,
    });
  }

  res.status(202).json({
    status: 'PENDING',
    message: 'Verification request has been accepted and is being processed.',
    verificationId: result.job._id,
    identity: id,
  });
});

exports.getVerificationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const clientOrganization = req.clientOrganization;

  const status = await verificationService.getJobStatus(id, clientOrganization);

  res.status(200).json(status);
});