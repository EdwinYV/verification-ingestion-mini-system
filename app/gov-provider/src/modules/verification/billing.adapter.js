const billingService = require('../billing/service/billing.service');
const AppError = require('../../utils/AppError');

const BILLING_ERROR_MAP = {
  INSUFFICIENT_FUNDS: { statusCode: 402, code: 'BILLING402' },
  WALLET_SUSPENDED: { statusCode: 403, code: 'BILLING403' },
  WALLET_NOT_FOUND: { statusCode: 404, code: 'BILLING404' },
};

class BillingAdapter {
  async chargeWallet(organizationId, verificationType, idempotencyKey) {
    const billingResult = await billingService.chargeWallet(
      organizationId,
      verificationType,
      idempotencyKey
    );

    if (billingResult.success) {
      return;
    }

    const mapped = BILLING_ERROR_MAP[billingResult.error] || {
      statusCode: 500,
      code: 'BILLING500',
    };

    throw new AppError(
      billingResult.message || 'Billing failed',
      mapped.statusCode,
      mapped.code
    );
  }
}

module.exports = new BillingAdapter();

