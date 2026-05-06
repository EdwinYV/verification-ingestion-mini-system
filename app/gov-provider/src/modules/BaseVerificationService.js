const AppError = require('../utils/AppError');
const billingAdapter = require('./verification/billing.adapter');
const auditLogger = require('./verification/audit.logger');
const maskingService = require('./verification/masking.service');

class BaseVerificationService {
  constructor({ verificationType, model, searchField, billing, audit, masking }) {
    this.verificationType = verificationType;
    this.Model = model;
    this.searchField = searchField;
    this.billing = billing || billingAdapter;
    this.audit = audit || auditLogger;
    this.masking = masking || maskingService;
  }

  async verify(id, mode, purpose, organization, idempotencyKey) {
    await this.billing.chargeWallet(organization._id.toString(), this.verificationType, idempotencyKey);

    try {
      const record = await this.Model.findOne({ [this.searchField]: id });

      if (!record) {
        await this.audit.log({
          organizationId: organization._id,
          verificationType: this.verificationType,
          searchId: id,
          purpose,
          mode,
          status: 'NOT_FOUND',
          fieldsAccessed: [],
        });
        throw new AppError(`${this.verificationType} not found`, 404, 'NOT_FOUND');
      }

      const responseData = this.masking.mask(record.toObject(), mode);
      const fieldsAccessed = Object.keys(responseData);

      await this.audit.log({
        organizationId: organization._id,
        verificationType: this.verificationType,
        searchId: id,
        purpose,
        mode,
        status: 'SUCCESS',
        fieldsAccessed,
      });

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
