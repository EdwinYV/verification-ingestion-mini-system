const mongoose = require('mongoose');
const { JOB_STATUS } = require('../../../shared/constants/verification');

const verificationLogSchema = new mongoose.Schema({
  verificationType: {
    type: String,
    required: true,
    index: true
  },
  searchId: {
    type: String,
    required: true,
  },
  mode: {
    type: String, // Store the mode (e.g., 'basic_identity')
  },
  status: {
    type: String,
    enum: Object.values(JOB_STATUS),
    default: JOB_STATUS.PENDING,
    index: true
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  provider: {
    type: String,
    default: 'GOV_PROVIDER',
  },
  responsePayload: {
    type: mongoose.Schema.Types.Mixed,
  },
  errorMessage: {
    type: String,
  },
  clientOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientOrganization',
    index: true
  },
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: {
    type: Date,
  },
}, { timestamps: true });

verificationLogSchema.index({ clientOrganizationId: 1, requestedAt: -1 });

module.exports = mongoose.model('VerificationLog', verificationLogSchema);