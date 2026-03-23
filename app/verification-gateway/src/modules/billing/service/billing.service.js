const path = require('path');
const { trace, SpanStatusCode, context, propagation } = require('@opentelemetry/api');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const env = require('../../../config/env');

const tracer = trace.getTracer('verification-gateway');
const TENANT = 'verification-gateway';
const MINOR_PER_MAJOR = 100;
const DEADLINE_MS = env.BILLING_GRPC_DEADLINE_MS;

const PROTO_PATH = path.resolve(__dirname, '../../../grpc/proto/billing.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const billingProto = protoDescriptor.billing.v1;

const client = new billingProto.BillingService(
  env.BILLING_GRPC_ADDR,
  grpc.credentials.createInsecure()
);

const SERVICE_TYPE_ENUM = {
  NIN: 'SERVICE_TYPE_NIN',
  BVN: 'SERVICE_TYPE_BVN',
  PASSPORT: 'SERVICE_TYPE_PASSPORT',
  DRIVERS_LICENSE: 'SERVICE_TYPE_DRIVERS_LICENSE',
};

function toMinorUnits(amount) {
  return Math.round(Number(amount) * MINOR_PER_MAJOR);
}

function fromMinorUnits(amountMinor) {
  return Number(amountMinor) / MINOR_PER_MAJOR;
}

function buildMetadata(idempotencyKey) {
  const carrier = {};
  propagation.inject(context.active(), carrier);
  const metadata = new grpc.Metadata();

  Object.entries(carrier).forEach(([key, value]) => {
    metadata.set(key, String(value));
  });

  if (idempotencyKey) {
    metadata.set('x-idempotency-key', idempotencyKey);
  }

  return metadata;
}

function grpcCall(method, request, { idempotencyKey } = {}) {
  return new Promise((resolve, reject) => {
    const metadata = buildMetadata(idempotencyKey);
    const deadline = new Date(Date.now() + DEADLINE_MS);

    client[method](request, metadata, { deadline }, (error, response) => {
      if (error) {
        return reject(error);
      }
      return resolve(response);
    });
  });
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

class BillingServiceClient {
  async findOrCreateWallet(organizationId) {
    return withBillingSpan('billing.grpc.find_or_create_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': TENANT,
    }, async () => {
      const response = await grpcCall('findOrCreateWallet', {
        wallet: { tenant: TENANT, organizationId },
      });

      return {
        wallet: {
          id: response.wallet.id,
          tenant: response.wallet.tenant,
          organizationId: response.wallet.organizationId,
          balance: fromMinorUnits(response.wallet.balanceMinor),
          currency: response.wallet.currency,
          status: response.wallet.status,
          createdAt: response.wallet.createdAt,
          updatedAt: response.wallet.updatedAt,
        },
        created: response.created,
      };
    });
  }

  async getBalance(organizationId) {
    return withBillingSpan('billing.grpc.get_balance', {
      'billing.organization_id': organizationId,
      'billing.tenant': TENANT,
    }, async () => {
      const response = await grpcCall('getBalance', {
        wallet: { tenant: TENANT, organizationId },
      });

      return fromMinorUnits(response.balanceMinor);
    });
  }

  async fundWallet(organizationId, amount, reference, idempotencyKey) {
    return withBillingSpan('billing.grpc.fund_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': TENANT,
      'billing.amount': Number(amount),
    }, async () => {
      const response = await grpcCall(
        'fundWallet',
        {
          wallet: { tenant: TENANT, organizationId },
          amountMinor: String(toMinorUnits(amount)),
          reference: reference || '',
          idempotencyKey: idempotencyKey || '',
        },
        { idempotencyKey }
      );

      return {
        newBalance: fromMinorUnits(response.newBalanceMinor),
        reference: response.reference,
      };
    });
  }

  async chargeWallet(organizationId, serviceType, idempotencyKey) {
    return withBillingSpan('billing.grpc.charge_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': TENANT,
      'billing.service_type': serviceType,
    }, async () => {
      const grpcServiceType = SERVICE_TYPE_ENUM[serviceType];
      if (!grpcServiceType) {
        return {
          success: false,
          error: 'INVALID_SERVICE',
          message: `Unknown service type: ${serviceType}`,
        };
      }

      const response = await grpcCall(
        'chargeWallet',
        {
          wallet: { tenant: TENANT, organizationId },
          serviceType: grpcServiceType,
          idempotencyKey: idempotencyKey || '',
        },
        { idempotencyKey }
      );

      if (!response.success) {
        return {
          success: false,
          error: response.error?.code || 'BILLING_ERROR',
          message: response.error?.message || 'Billing charge failed',
        };
      }

      return {
        success: true,
        cost: fromMinorUnits(response.costMinor),
        newBalance: fromMinorUnits(response.newBalanceMinor),
      };
    });
  }

  async refundWallet(organizationId, serviceType, reference) {
    return withBillingSpan('billing.grpc.refund_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': TENANT,
      'billing.service_type': serviceType,
      'billing.reference': reference || '',
    }, async () => {
      const grpcServiceType = SERVICE_TYPE_ENUM[serviceType];
      if (!grpcServiceType) {
        return {
          success: false,
          error: 'INVALID_SERVICE',
          message: `Unknown service type: ${serviceType}`,
        };
      }

      const response = await grpcCall('refundWallet', {
        wallet: { tenant: TENANT, organizationId },
        serviceType: grpcServiceType,
        reference: reference || '',
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error?.code || 'BILLING_ERROR',
          message: response.error?.message || 'Billing refund failed',
        };
      }

      return {
        success: true,
        newBalance: fromMinorUnits(response.newBalanceMinor),
      };
    });
  }

  async getHistory(organizationId, page = 1, limit = 20) {
    return withBillingSpan('billing.grpc.get_history', {
      'billing.organization_id': organizationId,
      'billing.tenant': TENANT,
      'billing.page': Number(page),
      'billing.limit': Number(limit),
    }, async () => {
      const response = await grpcCall('getHistory', {
        wallet: { tenant: TENANT, organizationId },
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });

      return {
        total: Number(response.total),
        page: response.page,
        pages: response.pages,
        transactions: (response.transactions || []).map((tx) => ({
          id: tx.id,
          walletId: tx.walletId,
          type: tx.type.replace('TRANSACTION_TYPE_', ''),
          amount: fromMinorUnits(tx.amountMinor),
          balanceBefore: fromMinorUnits(tx.balanceBeforeMinor),
          balanceAfter: fromMinorUnits(tx.balanceAfterMinor),
          description: tx.description,
          reference: tx.reference,
          status: tx.status,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt,
        })),
      };
    });
  }
}

module.exports = new BillingServiceClient();
