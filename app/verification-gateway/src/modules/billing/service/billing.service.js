const { sequelize } = require('../../../config/database');
const { redisClient } = require('../../../config/redis');
const Wallet = require('../data/models/wallet.model');
const Transaction = require('../data/models/transaction.model');
const PRICING = require('../../../config/pricing');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

const GATEWAY_SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';
const tracer = trace.getTracer('verification-gateway');

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
  async findOrCreateWallet(organizationId) {
    return withBillingSpan(
      'billing.find_or_create_wallet',
      { 'billing.organization_id': organizationId },
      async () => {
        const [wallet, created] = await Wallet.findOrCreate({
          where: { organizationId },
          defaults: { organizationId },
        });
        return { wallet, created };
      }
    );
  }

  async getBalance(organizationId) {
    return withBillingSpan(
      'billing.get_balance',
      { 'billing.organization_id': organizationId },
      async () => {
        const wallet = await Wallet.findOne({ where: { organizationId } });
        if (!wallet) {
          const error = new Error('Wallet not found for this organization.');
          error.code = 'BILLING404';
          throw error;
        }
        return wallet.balance;
      }
    );
  }

  async fundWallet(organizationId, amount, reference, idempotencyKey) {
    return withBillingSpan(
      'billing.fund_wallet',
      {
        'billing.organization_id': organizationId,
        'billing.amount': amount,
        'billing.idempotent': Boolean(idempotencyKey),
      },
      async () => {
        if (idempotencyKey) {
          const cachedResult = await redisClient.get(`gateway:billing:fund:${idempotencyKey}`);
          if (cachedResult) return JSON.parse(cachedResult);
        }

        if (amount <= 0) {
          const error = new Error('Funding amount must be positive.');
          error.code = 'BILLING400';
          throw error;
        }

        const t = await sequelize.transaction();
        try {
          const wallet = await Wallet.findOne({ where: { organizationId }, transaction: t, lock: t.LOCK.UPDATE });
          if (!wallet) {
            const error = new Error('Wallet not found for this organization.');
            error.code = 'BILLING404';
            throw error;
          }

          const balanceBefore = Number(wallet.balance);

          await wallet.increment('balance', { by: amount, transaction: t });
          await wallet.reload({ transaction: t });

          const balanceAfter = Number(wallet.balance);

          await Transaction.create(
            {
              walletId: wallet.id,
              type: 'CREDIT',
              amount,
              balanceBefore,
              balanceAfter,
              description: 'Wallet Funding',
              reference: idempotencyKey || reference,
              status: 'SUCCESS',
            },
            { transaction: t }
          );

          await t.commit();

          const result = { newBalance: balanceAfter, reference: idempotencyKey || reference };
          if (idempotencyKey) {
            await redisClient.set(`gateway:billing:fund:${idempotencyKey}`, JSON.stringify(result), { EX: 86400 });
          }

          return result;
        } catch (error) {
          await t.rollback();
          throw error;
        }
      }
    );
  }

  async chargeWallet(organizationId, serviceType, idempotencyKey) {
    return withBillingSpan(
      'billing.charge_wallet',
      {
        'billing.organization_id': organizationId,
        'billing.service_type': serviceType,
        'billing.idempotent': Boolean(idempotencyKey),
      },
      async () => {
        if (idempotencyKey) {
          const cachedResult = await redisClient.get(`gateway:billing:${idempotencyKey}`);
          if (cachedResult) return JSON.parse(cachedResult);
        }

        const cost = PRICING[serviceType];
        if (!cost) {
          return { success: false, error: 'INVALID_SERVICE', message: `Unknown service type: ${serviceType}` };
        }

        const t = await sequelize.transaction();
        try {
          const clientWallet = await Wallet.findOne({ where: { organizationId }, transaction: t, lock: t.LOCK.UPDATE });

          if (!clientWallet) {
            return { success: false, error: 'WALLET_NOT_FOUND', message: 'Client wallet does not exist.' };
          }
          if (clientWallet.status === 'SUSPENDED') {
            return { success: false, error: 'WALLET_SUSPENDED', message: 'Client wallet is suspended.' };
          }

          const systemWallet = await Wallet.findOne({ where: { organizationId: GATEWAY_SYSTEM_ORG_ID }, transaction: t, lock: t.LOCK.UPDATE });
          if (!systemWallet) {
            const criticalError = new Error('Gateway system revenue wallet not found. This is a critical configuration issue.');
            criticalError.code = 'SYS_WALLET_MISSING';
            throw criticalError;
          }

          if (Number(clientWallet.balance) < cost) {
            return { success: false, error: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds for this transaction.' };
          }

          const clientBalanceBefore = Number(clientWallet.balance);
          const systemBalanceBefore = Number(systemWallet.balance);

          await clientWallet.decrement('balance', { by: cost, transaction: t });
          await systemWallet.increment('balance', { by: cost, transaction: t });

          await clientWallet.reload({ transaction: t });
          await systemWallet.reload({ transaction: t });

          const clientBalanceAfter = Number(clientWallet.balance);
          const systemBalanceAfter = Number(systemWallet.balance);

          await Transaction.create(
            {
              walletId: clientWallet.id,
              type: 'DEBIT',
              amount: cost,
              balanceBefore: clientBalanceBefore,
              balanceAfter: clientBalanceAfter,
              description: `${serviceType} Verification`,
              reference: idempotencyKey,
            },
            { transaction: t }
          );

          await Transaction.create(
            {
              walletId: systemWallet.id,
              type: 'CREDIT',
              amount: cost,
              balanceBefore: systemBalanceBefore,
              balanceAfter: systemBalanceAfter,
              description: `Revenue from ${serviceType} - Org: ${organizationId}`,
              reference: idempotencyKey,
            },
            { transaction: t }
          );

          await t.commit();

          const result = { success: true, cost, newBalance: clientBalanceAfter };
          if (idempotencyKey) {
            await redisClient.set(`gateway:billing:${idempotencyKey}`, JSON.stringify(result), { EX: 86400 });
          }
          return result;
        } catch (error) {
          await t.rollback();
          if (error.code === 'SYS_WALLET_MISSING') {
            console.error('CRITICAL: System revenue wallet is missing!', error);
            return { success: false, error: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable due to a configuration issue. Please try again later.' };
          }
          throw error;
        }
      }
    );
  }

  async refundWallet(organizationId, serviceType, reference) {
    return withBillingSpan(
      'billing.refund_wallet',
      {
        'billing.organization_id': organizationId,
        'billing.service_type': serviceType,
        'billing.reference': reference || '',
      },
      async () => {
        const cost = PRICING[serviceType];
        if (!cost) {
          return { success: false, error: 'INVALID_SERVICE', message: `Unknown service type: ${serviceType}` };
        }

        const existingRefund = await Transaction.findOne({ where: { reference, type: 'CREDIT', description: `Refund for failed ${serviceType} Verification` } });
        if (existingRefund) {
          console.log(`Refund with reference ${reference} already processed. Kindly hang on.`);
          return { success: true, newBalance: existingRefund.balanceAfter };
        }

        const t = await sequelize.transaction();
        try {
          const clientWallet = await Wallet.findOne({ where: { organizationId }, transaction: t, lock: t.LOCK.UPDATE });
          const systemWallet = await Wallet.findOne({ where: { organizationId: GATEWAY_SYSTEM_ORG_ID }, transaction: t, lock: t.LOCK.UPDATE });

          if (!clientWallet || !systemWallet) {
            throw new Error('Wallet not found during refund.');
          }

          const clientBalanceBefore = Number(clientWallet.balance);
          const systemBalanceBefore = Number(systemWallet.balance);

          await clientWallet.increment('balance', { by: cost, transaction: t });
          await systemWallet.decrement('balance', { by: cost, transaction: t });

          await clientWallet.reload({ transaction: t });
          await systemWallet.reload({ transaction: t });

          const clientBalanceAfter = Number(clientWallet.balance);
          const systemBalanceAfter = Number(systemWallet.balance);

          await Transaction.create(
            {
              walletId: clientWallet.id,
              type: 'CREDIT',
              amount: cost,
              balanceBefore: clientBalanceBefore,
              balanceAfter: clientBalanceAfter,
              description: `Refund for failed ${serviceType} Verification`,
              reference,
            },
            { transaction: t }
          );

          await Transaction.create(
            {
              walletId: systemWallet.id,
              type: 'DEBIT',
              amount: cost,
              balanceBefore: systemBalanceBefore,
              balanceAfter: systemBalanceAfter,
              description: `Refund to Org: ${organizationId}`,
              reference,
            },
            { transaction: t }
          );

          await t.commit();
          return { success: true, newBalance: clientBalanceAfter };
        } catch (error) {
          await t.rollback();
          console.error('Refund failed:', error);
          throw error;
        }
      }
    );
  }

  async getHistory(organizationId, page = 1, limit = 20) {
    return withBillingSpan(
      'billing.get_history',
      {
        'billing.organization_id': organizationId,
        'billing.page': Number(page),
        'billing.limit': Number(limit),
      },
      async () => {
        const wallet = await Wallet.findOne({ where: { organizationId } });
        if (!wallet) {
          const error = new Error('Wallet not found for this organization.');
          error.code = 'BILLING404';
          throw error;
        }

        const offset = (page - 1) * limit;
        const { count, rows } = await Transaction.findAndCountAll({
          where: { walletId: wallet.id },
          order: [['createdAt', 'DESC']],
          limit,
          offset,
        });

        return {
          total: count,
          page,
          pages: Math.ceil(count / limit),
          transactions: rows,
        };
      }
    );
  }
}

module.exports = new BillingService();
