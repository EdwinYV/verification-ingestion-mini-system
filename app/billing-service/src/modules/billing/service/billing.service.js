const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { sequelize } = require('../../../config/database');
const { redisClient } = require('../../../config/redis');
const PRICING = require('../../../config/pricing');
const Wallet = require('../data/models/wallet.model');
const Transaction = require('../data/models/transaction.model');

const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';
const tracer = trace.getTracer('billing-service');

function getCacheKey(prefix, tenant, key) {
  return `billing:${prefix}:${tenant}:${key}`;
}

function getServiceCostMinor(tenant, serviceType) {
  const tenantPricing = PRICING[tenant];
  if (!tenantPricing) {
    return null;
  }
  return tenantPricing[serviceType] || null;
}

function toWalletDto(wallet) {
  return {
    id: wallet.id,
    tenant: wallet.tenant,
    organizationId: wallet.organizationId,
    balanceMinor: Number(wallet.balanceMinor),
    currency: wallet.currency,
    status: wallet.status,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

function toTransactionDto(tx) {
  return {
    id: tx.id,
    walletId: tx.walletId,
    tenant: tx.tenant,
    type: tx.type,
    amountMinor: Number(tx.amountMinor),
    balanceBeforeMinor: Number(tx.balanceBeforeMinor),
    balanceAfterMinor: Number(tx.balanceAfterMinor),
    description: tx.description,
    reference: tx.reference,
    status: tx.status,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

async function withBillingSpan(name, attributes, fn) {
  const span = tracer.startSpan(name, { attributes });
  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}

class BillingService {
  async findOrCreateWallet(tenant, organizationId) {
    return withBillingSpan('billing.find_or_create_wallet', {
      'billing.tenant': tenant,
      'billing.organization_id': organizationId,
    }, async () => {
      const [wallet, created] = await Wallet.findOrCreate({
        where: { tenant, organizationId },
        defaults: { tenant, organizationId },
      });

      return { wallet: toWalletDto(wallet), created };
    });
  }

  async ensureSystemWallet(tenant, transaction) {
    const [wallet] = await Wallet.findOrCreate({
      where: { tenant, organizationId: SYSTEM_ORG_ID },
      defaults: { tenant, organizationId: SYSTEM_ORG_ID },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });

    if (transaction) {
      await wallet.reload({ transaction, lock: transaction.LOCK.UPDATE });
    }
    return wallet;
  }

  async getBalance(tenant, organizationId) {
    return withBillingSpan('billing.get_balance', {
      'billing.tenant': tenant,
      'billing.organization_id': organizationId,
    }, async () => {
      const wallet = await Wallet.findOne({ where: { tenant, organizationId } });
      if (!wallet) {
        const err = new Error('Wallet not found for this organization.');
        err.code = 'WALLET_NOT_FOUND';
        throw err;
      }
      return { balanceMinor: Number(wallet.balanceMinor), currency: wallet.currency };
    });
  }

  async fundWallet(tenant, organizationId, amountMinor, reference, idempotencyKey) {
    return withBillingSpan('billing.fund_wallet', {
      'billing.tenant': tenant,
      'billing.organization_id': organizationId,
      'billing.amount_minor': Number(amountMinor),
      'billing.idempotent': Boolean(idempotencyKey),
    }, async () => {
      if (idempotencyKey) {
        const cached = await redisClient.get(getCacheKey('fund', tenant, idempotencyKey));
        if (cached) {
          return JSON.parse(cached);
        }
      }

      if (!Number.isInteger(Number(amountMinor)) || Number(amountMinor) <= 0) {
        const err = new Error('Funding amount must be positive.');
        err.code = 'INVALID_AMOUNT';
        throw err;
      }

      const t = await sequelize.transaction();
      try {
        const wallet = await Wallet.findOne({
          where: { tenant, organizationId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!wallet) {
          const err = new Error('Wallet not found for this organization.');
          err.code = 'WALLET_NOT_FOUND';
          throw err;
        }

        const balanceBeforeMinor = Number(wallet.balanceMinor);
        await wallet.increment('balanceMinor', { by: Number(amountMinor), transaction: t });
        await wallet.reload({ transaction: t });
        const balanceAfterMinor = Number(wallet.balanceMinor);

        const tx = await Transaction.create(
          {
            walletId: wallet.id,
            tenant,
            type: 'CREDIT',
            amountMinor: Number(amountMinor),
            balanceBeforeMinor,
            balanceAfterMinor,
            description: 'Wallet Funding',
            reference: idempotencyKey || reference,
            status: 'SUCCESS',
          },
          { transaction: t }
        );

        await t.commit();

        const result = {
          newBalanceMinor: balanceAfterMinor,
          currency: wallet.currency,
          reference: tx.reference,
        };

        if (idempotencyKey) {
          await redisClient.set(
            getCacheKey('fund', tenant, idempotencyKey),
            JSON.stringify(result),
            { EX: 86400 }
          );
        }

        return result;
      } catch (error) {
        await t.rollback();
        throw error;
      }
    });
  }

  async chargeWallet(tenant, organizationId, serviceType, idempotencyKey) {
    return withBillingSpan('billing.charge_wallet', {
      'billing.tenant': tenant,
      'billing.organization_id': organizationId,
      'billing.service_type': serviceType,
      'billing.idempotent': Boolean(idempotencyKey),
    }, async () => {
      if (idempotencyKey) {
        const cached = await redisClient.get(getCacheKey('charge', tenant, idempotencyKey));
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const costMinor = getServiceCostMinor(tenant, serviceType);
      if (!costMinor) {
        return {
          success: false,
          error: { code: 'INVALID_SERVICE', message: `Unknown service type: ${serviceType}` },
        };
      }

      const t = await sequelize.transaction();
      try {
        const clientWallet = await Wallet.findOne({
          where: { tenant, organizationId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!clientWallet) {
          await t.rollback();
          return { success: false, error: { code: 'WALLET_NOT_FOUND', message: 'Client wallet does not exist.' } };
        }

        if (clientWallet.status === 'SUSPENDED') {
          await t.rollback();
          return { success: false, error: { code: 'WALLET_SUSPENDED', message: 'Client wallet is suspended.' } };
        }

        const systemWallet = await this.ensureSystemWallet(tenant, t);

        if (Number(clientWallet.balanceMinor) < costMinor) {
          await t.rollback();
          return { success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds for this transaction.' } };
        }

        const clientBalanceBeforeMinor = Number(clientWallet.balanceMinor);
        const systemBalanceBeforeMinor = Number(systemWallet.balanceMinor);

        await clientWallet.decrement('balanceMinor', { by: costMinor, transaction: t });
        await systemWallet.increment('balanceMinor', { by: costMinor, transaction: t });
        await clientWallet.reload({ transaction: t });
        await systemWallet.reload({ transaction: t });

        const clientBalanceAfterMinor = Number(clientWallet.balanceMinor);
        const systemBalanceAfterMinor = Number(systemWallet.balanceMinor);

        await Transaction.create(
          {
            walletId: clientWallet.id,
            tenant,
            type: 'DEBIT',
            amountMinor: costMinor,
            balanceBeforeMinor: clientBalanceBeforeMinor,
            balanceAfterMinor: clientBalanceAfterMinor,
            description: `${serviceType} Verification`,
            reference: idempotencyKey,
          },
          { transaction: t }
        );

        await Transaction.create(
          {
            walletId: systemWallet.id,
            tenant,
            type: 'CREDIT',
            amountMinor: costMinor,
            balanceBeforeMinor: systemBalanceBeforeMinor,
            balanceAfterMinor: systemBalanceAfterMinor,
            description: `Revenue from ${serviceType} - Org: ${organizationId}`,
            reference: idempotencyKey,
          },
          { transaction: t }
        );

        await t.commit();

        const result = {
          success: true,
          costMinor,
          newBalanceMinor: clientBalanceAfterMinor,
          currency: clientWallet.currency,
          error: null,
        };

        if (idempotencyKey) {
          await redisClient.set(
            getCacheKey('charge', tenant, idempotencyKey),
            JSON.stringify(result),
            { EX: 86400 }
          );
        }

        return result;
      } catch (error) {
        await t.rollback();
        throw error;
      }
    });
  }

  async refundWallet(tenant, organizationId, serviceType, reference) {
    return withBillingSpan('billing.refund_wallet', {
      'billing.tenant': tenant,
      'billing.organization_id': organizationId,
      'billing.service_type': serviceType,
      'billing.reference': reference || '',
    }, async () => {
      const costMinor = getServiceCostMinor(tenant, serviceType);
      if (!costMinor) {
        return {
          success: false,
          error: { code: 'INVALID_SERVICE', message: `Unknown service type: ${serviceType}` },
        };
      }

      const existingRefund = await Transaction.findOne({
        where: {
          tenant,
          reference,
          type: 'CREDIT',
          description: `Refund for failed ${serviceType} Verification`,
        },
      });

      if (existingRefund) {
        return {
          success: true,
          newBalanceMinor: Number(existingRefund.balanceAfterMinor),
          currency: 'NGN',
          error: null,
        };
      }

      const t = await sequelize.transaction();
      try {
        const clientWallet = await Wallet.findOne({
          where: { tenant, organizationId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        const systemWallet = await this.ensureSystemWallet(tenant, t);

        if (!clientWallet || !systemWallet) {
          throw new Error('Wallet not found during refund.');
        }

        const clientBalanceBeforeMinor = Number(clientWallet.balanceMinor);
        const systemBalanceBeforeMinor = Number(systemWallet.balanceMinor);

        await clientWallet.increment('balanceMinor', { by: costMinor, transaction: t });
        await systemWallet.decrement('balanceMinor', { by: costMinor, transaction: t });
        await clientWallet.reload({ transaction: t });
        await systemWallet.reload({ transaction: t });

        const clientBalanceAfterMinor = Number(clientWallet.balanceMinor);
        const systemBalanceAfterMinor = Number(systemWallet.balanceMinor);

        await Transaction.create(
          {
            walletId: clientWallet.id,
            tenant,
            type: 'CREDIT',
            amountMinor: costMinor,
            balanceBeforeMinor: clientBalanceBeforeMinor,
            balanceAfterMinor: clientBalanceAfterMinor,
            description: `Refund for failed ${serviceType} Verification`,
            reference,
          },
          { transaction: t }
        );

        await Transaction.create(
          {
            walletId: systemWallet.id,
            tenant,
            type: 'DEBIT',
            amountMinor: costMinor,
            balanceBeforeMinor: systemBalanceBeforeMinor,
            balanceAfterMinor: systemBalanceAfterMinor,
            description: `Refund to Org: ${organizationId}`,
            reference,
          },
          { transaction: t }
        );

        await t.commit();
        return {
          success: true,
          newBalanceMinor: clientBalanceAfterMinor,
          currency: clientWallet.currency,
          error: null,
        };
      } catch (error) {
        await t.rollback();
        throw error;
      }
    });
  }

  async getHistory(tenant, organizationId, page = 1, limit = 20) {
    return withBillingSpan('billing.get_history', {
      'billing.tenant': tenant,
      'billing.organization_id': organizationId,
      'billing.page': Number(page),
      'billing.limit': Number(limit),
    }, async () => {
      const wallet = await Wallet.findOne({ where: { tenant, organizationId } });
      if (!wallet) {
        const err = new Error('Wallet not found for this organization.');
        err.code = 'WALLET_NOT_FOUND';
        throw err;
      }

      const safePage = Number(page) > 0 ? Number(page) : 1;
      const safeLimit = Number(limit) > 0 ? Number(limit) : 20;
      const offset = (safePage - 1) * safeLimit;

      const { count, rows } = await Transaction.findAndCountAll({
        where: { walletId: wallet.id },
        order: [['createdAt', 'DESC']],
        limit: safeLimit,
        offset,
      });

      return {
        total: count,
        page: safePage,
        pages: Math.ceil(count / safeLimit),
        transactions: rows.map(toTransactionDto),
      };
    });
  }
}

module.exports = new BillingService();
