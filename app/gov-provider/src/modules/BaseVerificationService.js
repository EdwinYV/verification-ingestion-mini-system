const AuditLog = require('../models/AuditLog.model');
const billingService = require('./billing/service/billing.service');
const AppError = require('../utils/AppError');
const { maskData } = require('../privacy/masking.util');

class BaseVerificationService {
  constructor(verificationType, model, searchField) {
    this.verificationType = verificationType;
    this.Model = model;
    this.searchField = searchField;
  }

  async handleBilling(organizationId, idempotencyKey) {
    const billingResult = await billingService.chargeWallet(
      organizationId,
      this.verificationType,
      idempotencyKey
    );

    if (!billingResult.success) {
      let statusCode = 500;
      let errorCode = 'BILLING500';

      switch (billingResult.error) {
        case 'INSUFFICIENT_FUNDS':
          statusCode = 402;
          errorCode = 'BILLING402';
          break;
        case 'WALLET_SUSPENDED':
          statusCode = 403;
          errorCode = 'BILLING403';
          break;
        case 'WALLET_NOT_FOUND':
          statusCode = 404;
          errorCode = 'BILLING404';
          break;
        default:
          statusCode = 500;
          errorCode = 'BILLING500';
      }
      
      throw new AppError(billingResult.message || 'Billing failed', statusCode, errorCode);
    }
  }

  async logAudit(organizationId, searchId, purpose, mode, status, fieldsAccessed) {
    return AuditLog.create({
      organizationId,
      verificationType: this.verificationType,
      searchId,
      purpose,
      mode,
      status,
      fieldsAccessed
    });
  }

  async verify(id, mode, purpose, organization, idempotencyKey) {
    await this.handleBilling(organization._id.toString(), idempotencyKey);

    try {
      const record = await this.Model.findOne({ [this.searchField]: id });

      if (!record) {
        await this.logAudit(organization._id, id, purpose, mode, 'NOT_FOUND', []);
        throw new AppError(`${this.verificationType} not found`, 404, 'NOT_FOUND');
      }

      const responseData = maskData(record.toObject(), mode);
      const fieldsAccessed = Object.keys(responseData);

      await this.logAudit(organization._id, id, purpose, mode, 'SUCCESS', fieldsAccessed);

      return { found: true, data: responseData };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`Verification failed: ${error.message}`, 500, 'INTERNAL_ERROR');
    }
  }
}

module.exports = BaseVerificationService;
