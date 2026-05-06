const { trace, SpanStatusCode, context, propagation } = require('@opentelemetry/api');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const MINOR_PER_MAJOR = 100;

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

function grpcCall(client, method, request, deadlineMs, { idempotencyKey } = {}) {
  return new Promise((resolve, reject) => {
    const metadata = buildMetadata(idempotencyKey);
    const deadline = new Date(Date.now() + deadlineMs);

    client[method](request, metadata, { deadline }, (error, response) => {
      if (error) {
        return reject(error);
      }
      return resolve(response);
    });
  });
}

async function withBillingSpan(tracer, name, attributes, fn) {
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
  constructor({ client, tracer, tenant, deadlineMs }) {
    this.client = client;
    this.tracer = tracer;
    this.tenant = tenant;
    this.deadlineMs = deadlineMs;
  }

  async findOrCreateWallet(organizationId) {
    return withBillingSpan(this.tracer, 'billing.grpc.find_or_create_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': this.tenant,
    }, async () => {
      const response = await grpcCall(
        this.client,
        'findOrCreateWallet',
        { wallet: { tenant: this.tenant, organizationId } },
        this.deadlineMs
      );

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
    return withBillingSpan(this.tracer, 'billing.grpc.get_balance', {
      'billing.organization_id': organizationId,
      'billing.tenant': this.tenant,
    }, async () => {
      const response = await grpcCall(
        this.client,
        'getBalance',
        { wallet: { tenant: this.tenant, organizationId } },
        this.deadlineMs
      );

      return fromMinorUnits(response.balanceMinor);
    });
  }

  async fundWallet(organizationId, amount, reference, idempotencyKey) {
    return withBillingSpan(this.tracer, 'billing.grpc.fund_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': this.tenant,
      'billing.amount': Number(amount),
    }, async () => {
      const response = await grpcCall(
        this.client,
        'fundWallet',
        {
          wallet: { tenant: this.tenant, organizationId },
          amountMinor: String(toMinorUnits(amount)),
          reference: reference || '',
          idempotencyKey: idempotencyKey || '',
        },
        this.deadlineMs,
        { idempotencyKey }
      );

      return {
        newBalance: fromMinorUnits(response.newBalanceMinor),
        reference: response.reference,
      };
    });
  }

  async chargeWallet(organizationId, serviceType, idempotencyKey) {
    return withBillingSpan(this.tracer, 'billing.grpc.charge_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': this.tenant,
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
        this.client,
        'chargeWallet',
        {
          wallet: { tenant: this.tenant, organizationId },
          serviceType: grpcServiceType,
          idempotencyKey: idempotencyKey || '',
        },
        this.deadlineMs,
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
    return withBillingSpan(this.tracer, 'billing.grpc.refund_wallet', {
      'billing.organization_id': organizationId,
      'billing.tenant': this.tenant,
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

      const response = await grpcCall(
        this.client,
        'refundWallet',
        {
          wallet: { tenant: this.tenant, organizationId },
          serviceType: grpcServiceType,
          reference: reference || '',
        },
        this.deadlineMs
      );

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
    return withBillingSpan(this.tracer, 'billing.grpc.get_history', {
      'billing.organization_id': organizationId,
      'billing.tenant': this.tenant,
      'billing.page': Number(page),
      'billing.limit': Number(limit),
    }, async () => {
      const response = await grpcCall(
        this.client,
        'getHistory',
        {
          wallet: { tenant: this.tenant, organizationId },
          page: Number(page) || 1,
          limit: Number(limit) || 20,
        },
        this.deadlineMs
      );

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

function createBillingClient({ tenant, tracerName, billingGrpcAddr, deadlineMs, protoPath }) {
  if (!tenant) {
    throw new Error('tenant is required to create a billing client');
  }
  if (!billingGrpcAddr) {
    throw new Error('billingGrpcAddr is required to create a billing client');
  }
  if (!protoPath) {
    throw new Error('protoPath is required to create a billing client');
  }

  const resolvedDeadlineMs = Number(deadlineMs) || 10000;
  const tracer = trace.getTracer(tracerName || 'billing-client');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  const billingProto = protoDescriptor.billing.v1;

  const client = new billingProto.BillingService(
    billingGrpcAddr,
    grpc.credentials.createInsecure()
  );

  return new BillingServiceClient({
    client,
    tracer,
    tenant,
    deadlineMs: resolvedDeadlineMs,
  });
}

module.exports = {
  createBillingClient,
  MINOR_PER_MAJOR,
};

