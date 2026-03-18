const ninProvider = require('../../../providers/gov/nin.provider');
const bvnProvider = require('../../../providers/gov/bvn.provider');
const passportProvider = require('../../../providers/gov/passport.provider');
const dlProvider = require('../../../providers/gov/dl.provider');
const normalizer = require('../../../normalizers/identity.normalizer');
const VerificationLog = require('../../../models/verification-log.model');
const billingService = require('../../billing/service/billing.service');
const generateIdempotencyKey = require('../../../utils/generateKey');
const AppError = require('../../../utils/AppError');
const { redisClient } = require('../../../config/redis');
const { incrementMetric } = require('../../../utils/metrics.util');
const { publishToQueue } = require('../../../config/rabbitmq');
const { injectTraceHeaders } = require('../../../utils/tracing.util');
const { enqueueVerificationLogIndex } = require('../../audit/search/search-index.publisher');
const crypto = require('crypto');

const CACHE_TTL_SECONDS = 3600;

const VERIFICATION_TYPE = {
  NIN: 'NIN',
  BVN: 'BVN',
  PASSPORT: 'PASSPORT',
  DRIVERS_LICENSE: 'DRIVERS_LICENSE',
};

const JOB_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

class VerificationService {
  async createVerificationJob(jobDetails) {
    const { type, id, mode, purpose, clientOrganization, idempotencyKey: clientKey } = jobDetails;
    const idempotencyKey = clientKey || generateIdempotencyKey();

    try {
      const verificationLog = await VerificationLog.create({
        verificationType: type,
        searchId: id,
        mode: mode,
        status: JOB_STATUS.PENDING,
        clientOrganizationId: clientOrganization._id,
        idempotencyKey,
      });

      const jobData = {
        logId: verificationLog._id,
        type,
        id,
        mode,
        purpose,
        clientOrganizationId: clientOrganization._id.toString(),
        idempotencyKey,
      };
      
      publishToQueue(jobData, { headers: injectTraceHeaders() });
      enqueueVerificationLogIndex(verificationLog._id, 'created');

      return { isDuplicate: false, job: verificationLog };
    } catch (error) {
      if (error.code === 11000) {
        const existingLog = await VerificationLog.findOne({ idempotencyKey });
        return { isDuplicate: true, job: existingLog };
      }
      throw error;
    }
  }

  async getJobStatus(logId, clientOrganization) {
    const verification = await VerificationLog.findById(logId);

    if (!verification) {
      throw new AppError('Verification record not found.', 404, 'NOT_FOUND');
    }

    if (verification.clientOrganizationId.toString() !== clientOrganization._id.toString()) {
      throw new AppError('You are not authorized to view this verification record.', 403, 'FORBIDDEN');
    }

    return {
      status: verification.status,
      verificationId: verification._id,
      data: verification.status === JOB_STATUS.COMPLETED ? verification.responsePayload : null,
      error: verification.status === JOB_STATUS.FAILED ? verification.errorMessage : null,
      createdAt: verification.createdAt,
      completedAt: verification.completedAt,
    };
  }

  async handleWebhook(payload) {
    const { verificationId, status, data, error } = payload;

    if (!payload) {
      throw new AppError('Invalid webhook payload. Missing webhook details.', 400, 'BAD_REQUEST');
    }
    const log = await VerificationLog.findById(verificationId);
    if (!log) {
      throw new AppError('Verification record not found for webhook.', 404, 'NOT_FOUND');
    }

    if (log.status === JOB_STATUS.COMPLETED || log.status === JOB_STATUS.FAILED) {
      console.log(`Webhook ignored: Job ${verificationId} is already ${log.status}`);
      return;
    }

    if (status === JOB_STATUS.COMPLETED) {
      if (!data || typeof data !== 'object') {
        await this.updateLog(verificationId, JOB_STATUS.FAILED, null, 'Invalid webhook payload: missing verification data');
        return;
      }

      const normalizedData = await normalizer.normalize(log.verificationType, data);
      await this.updateLog(verificationId, JOB_STATUS.COMPLETED, normalizedData, null);

      const mode = log.mode || 'basic_identity';
      const cacheKey = this.generateCacheKey(log.verificationType, log.searchId, mode);
      try {
        await redisClient.set(cacheKey, JSON.stringify(data), { EX: CACHE_TTL_SECONDS });
      } catch (redisError) {
        console.error('Redis SET error (graceful degradation):', redisError);
      }
    } else if (status === JOB_STATUS.FAILED) {
      await this.updateLog(verificationId, JOB_STATUS.FAILED, null, error);
    }
  }

  async processVerificationJob(jobData) {
    const { logId, type, id, mode, purpose, clientOrganizationId, idempotencyKey } = jobData;
    const normalizedType = type.toUpperCase();

    const cacheKey = this.generateCacheKey(normalizedType, id, mode);
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        incrementMetric('hits');
        await this.updateLog(logId, JOB_STATUS.COMPLETED, JSON.parse(cachedResult));
        return;
      }
      incrementMetric('misses');
    } catch (redisError) {
      console.error('Redis GET error (graceful degradation):', redisError);
      incrementMetric('misses');
    }

    const billingResult = await billingService.chargeWallet(
      clientOrganizationId,
      normalizedType,
      idempotencyKey
    );

    if (!billingResult.success) {
      await this.updateLog(logId, JOB_STATUS.FAILED, null, `Billing failed: ${billingResult.message}`);
      return;
    }

    try {
      const callbackUrl = `${process.env.GATEWAY_BASE_URL}/api/v1/webhook/gov-provider`;
      let providerResponse = null;

      switch (normalizedType) {
        case VERIFICATION_TYPE.NIN:
          providerResponse = await ninProvider.verify(id, mode, purpose, callbackUrl, logId);
          break;
        case VERIFICATION_TYPE.BVN:
          providerResponse = await bvnProvider.verify(id, mode, purpose, callbackUrl, logId);
          break;
        case VERIFICATION_TYPE.PASSPORT:
          providerResponse = await passportProvider.verify(id, mode, purpose, callbackUrl, logId);
          break;
        case VERIFICATION_TYPE.DRIVERS_LICENSE:
          providerResponse = await dlProvider.verify(id, mode, purpose, callbackUrl, logId);
          break;
        default:
          throw new Error(`Invalid verification type: ${type}`);
      }

      if (providerResponse.status !== 202) {
        throw new Error(`Unexpected response from gov-provider: ${providerResponse.status}`);
      }

    } catch (error) {
      console.error(`Verification job ${logId} failed to dispatch:`, error.message);

      try {
         await billingService.refundWallet(clientOrganizationId, normalizedType, idempotencyKey);
         await this.updateLog(logId, JOB_STATUS.FAILED, null, `Service dispatch failed: ${error.message}. Refund processed.`);
      } catch (refundError) {
         console.error(`Failed to refund wallet for job ${logId}:`, refundError);
         await this.updateLog(logId, JOB_STATUS.FAILED, null, `Service dispatch failed: ${error.message}. Refund FAILED - Manual intervention required.`);
      }

      throw new Error(`DISPATCH_FAILED: ${error.message}`);
    }
  }

  generateCacheKey(type, id, mode) {
    const hash = crypto.createHash('sha256').update(`${type}:${id}:${mode}`).digest('hex');
    return `verification:${hash}`;
  }

  async updateLog(logId, status, responsePayload = null, errorMessage = null) {
    try {
      const update = {
        status,
        responsePayload,
        errorMessage,
        completedAt: new Date(),
      };
      if (responsePayload && responsePayload.photo) {
        update.responsePayload.photo = '[BASE64_IMAGE_TRUNCATED]';
      }
      await VerificationLog.findByIdAndUpdate(logId, update);
      enqueueVerificationLogIndex(logId, 'updated');
    } catch (logError) {
      console.error(`Failed to update log ${logId}:`, logError);
    }
  }
}

module.exports = new VerificationService();
