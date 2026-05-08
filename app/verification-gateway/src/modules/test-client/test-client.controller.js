const verificationService = require('../verification/service/verification.service');
const ClientOrganization = require('../../models/ClientOrganization.model');
const asyncHandler = require('../../utils/asyncHandler');
const { NotFoundError } = require('../../../../shared/errors');


exports.testVerify = asyncHandler(async (req, res) => {
  const testClient = await ClientOrganization.findOne({ clientId: 'test-client-id' });
  if (!testClient) {
    throw new NotFoundError('Test client organization not found. Please ensure it is seeded.', 'NOT_FOUND');
  }

  const { type, id, mode, purpose } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'] || `test-${Date.now()}`;

  const result = await verificationService.createVerificationJob({
    type,
    id,
    mode,
    purpose,
    clientOrganization: testClient,
    idempotencyKey,
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


exports.testCheckStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const testClient = await ClientOrganization.findOne({ clientId: 'test-client-id' });
  if (!testClient) {
    throw new NotFoundError('Test client organization not found.', 'NOT_FOUND');
  }

  const statusResult = await verificationService.getJobStatus(id, testClient);

  res.status(200).json(statusResult);
});