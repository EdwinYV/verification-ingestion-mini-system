const billingService = require('../billing/service/billing.service');
const {
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  InternalError,
} = require('../../../../shared/errors');

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

    const message = billingResult.message || 'Billing failed';

    if (billingResult.error === 'INSUFFICIENT_FUNDS') {
      throw new PaymentRequiredError(message, 'BILLING402');
    }
    if (billingResult.error === 'WALLET_SUSPENDED') {
      throw new ForbiddenError(message, 'BILLING403');
    }
    if (billingResult.error === 'WALLET_NOT_FOUND') {
      throw new NotFoundError(message, 'BILLING404');
    }

    throw new InternalError(message, 'BILLING500');
  }
}

module.exports = new BillingAdapter();

