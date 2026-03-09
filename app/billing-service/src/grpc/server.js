const { context, propagation, trace, SpanStatusCode } = require('@opentelemetry/api');
const billingService = require('../modules/billing/service/billing.service');
const { grpc, billingProto } = require('./proto');

const tracer = trace.getTracer('billing-service-grpc');

const SERVICE_TYPE_MAP = {
  SERVICE_TYPE_NIN: 'NIN',
  SERVICE_TYPE_BVN: 'BVN',
  SERVICE_TYPE_PASSPORT: 'PASSPORT',
  SERVICE_TYPE_DRIVERS_LICENSE: 'DRIVERS_LICENSE',
};

const WALLET_STATUS_MAP = {
  ACTIVE: 'WALLET_STATUS_ACTIVE',
  SUSPENDED: 'WALLET_STATUS_SUSPENDED',
};

const TX_TYPE_MAP = {
  CREDIT: 'TRANSACTION_TYPE_CREDIT',
  DEBIT: 'TRANSACTION_TYPE_DEBIT',
};

function grpcError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function mapDomainError(error) {
  if (error.code === 'WALLET_NOT_FOUND') {
    return grpcError(grpc.status.NOT_FOUND, error.message);
  }
  if (error.code === 'INVALID_AMOUNT') {
    return grpcError(grpc.status.INVALID_ARGUMENT, error.message);
  }
  return grpcError(grpc.status.INTERNAL, error.message || 'Billing service error');
}

function metadataToCarrier(metadata) {
  const carrier = {};
  const map = metadata.getMap();
  Object.entries(map).forEach(([key, value]) => {
    carrier[key] = String(value);
  });
  return carrier;
}

function validateWalletRef(wallet) {
  if (!wallet || !wallet.tenant || !wallet.organizationId) {
    throw grpcError(grpc.status.INVALID_ARGUMENT, 'wallet.tenant and wallet.organization_id are required.');
  }
}

function toWalletMessage(wallet) {
  return {
    id: wallet.id,
    tenant: wallet.tenant,
    organizationId: wallet.organizationId,
    balanceMinor: String(wallet.balanceMinor),
    currency: wallet.currency,
    status: WALLET_STATUS_MAP[wallet.status] || 'WALLET_STATUS_UNKNOWN',
    createdAt: new Date(wallet.createdAt).toISOString(),
    updatedAt: new Date(wallet.updatedAt).toISOString(),
  };
}

function toTransactionMessage(tx) {
  return {
    id: tx.id,
    walletId: tx.walletId,
    tenant: tx.tenant,
    type: TX_TYPE_MAP[tx.type] || 'TRANSACTION_TYPE_UNKNOWN',
    amountMinor: String(tx.amountMinor),
    balanceBeforeMinor: String(tx.balanceBeforeMinor),
    balanceAfterMinor: String(tx.balanceAfterMinor),
    description: tx.description || '',
    reference: tx.reference || '',
    status: tx.status || 'SUCCESS',
    createdAt: new Date(tx.createdAt).toISOString(),
    updatedAt: new Date(tx.updatedAt).toISOString(),
  };
}

async function withGrpcTrace(call, rpcName, fn, callback) {
  const extracted = propagation.extract(context.active(), metadataToCarrier(call.metadata));

  await context.with(extracted, async () => {
    const span = tracer.startSpan(`grpc.${rpcName}`);
    try {
      const response = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      callback(null, response);
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      callback(error.code ? error : mapDomainError(error));
    } finally {
      span.end();
    }
  });
}

const handlers = {
  FindOrCreateWallet(call, callback) {
    withGrpcTrace(call, 'FindOrCreateWallet', async () => {
      validateWalletRef(call.request.wallet);
      const { wallet, created } = await billingService.findOrCreateWallet(
        call.request.wallet.tenant,
        call.request.wallet.organizationId
      );
      return { wallet: toWalletMessage(wallet), created };
    }, callback);
  },

  GetBalance(call, callback) {
    withGrpcTrace(call, 'GetBalance', async () => {
      validateWalletRef(call.request.wallet);
      const result = await billingService.getBalance(
        call.request.wallet.tenant,
        call.request.wallet.organizationId
      );
      return {
        balanceMinor: String(result.balanceMinor),
        currency: result.currency,
      };
    }, callback);
  },

  FundWallet(call, callback) {
    withGrpcTrace(call, 'FundWallet', async () => {
      validateWalletRef(call.request.wallet);
      const result = await billingService.fundWallet(
        call.request.wallet.tenant,
        call.request.wallet.organizationId,
        Number(call.request.amountMinor),
        call.request.reference,
        call.request.idempotencyKey
      );
      return {
        newBalanceMinor: String(result.newBalanceMinor),
        currency: result.currency,
        reference: result.reference || '',
      };
    }, callback);
  },

  ChargeWallet(call, callback) {
    withGrpcTrace(call, 'ChargeWallet', async () => {
      validateWalletRef(call.request.wallet);
      const serviceType = SERVICE_TYPE_MAP[call.request.serviceType] || '';
      if (!serviceType) {
        throw grpcError(grpc.status.INVALID_ARGUMENT, 'Invalid service_type.');
      }

      const result = await billingService.chargeWallet(
        call.request.wallet.tenant,
        call.request.wallet.organizationId,
        serviceType,
        call.request.idempotencyKey
      );

      return {
        success: result.success,
        costMinor: String(result.costMinor || 0),
        newBalanceMinor: String(result.newBalanceMinor || 0),
        currency: result.currency || 'NGN',
        error: result.error || null,
      };
    }, callback);
  },

  RefundWallet(call, callback) {
    withGrpcTrace(call, 'RefundWallet', async () => {
      validateWalletRef(call.request.wallet);
      const serviceType = SERVICE_TYPE_MAP[call.request.serviceType] || '';
      if (!serviceType) {
        throw grpcError(grpc.status.INVALID_ARGUMENT, 'Invalid service_type.');
      }

      const result = await billingService.refundWallet(
        call.request.wallet.tenant,
        call.request.wallet.organizationId,
        serviceType,
        call.request.reference
      );

      return {
        success: result.success,
        newBalanceMinor: String(result.newBalanceMinor || 0),
        currency: result.currency || 'NGN',
        error: result.error || null,
      };
    }, callback);
  },

  GetHistory(call, callback) {
    withGrpcTrace(call, 'GetHistory', async () => {
      validateWalletRef(call.request.wallet);
      const result = await billingService.getHistory(
        call.request.wallet.tenant,
        call.request.wallet.organizationId,
        call.request.page,
        call.request.limit
      );

      return {
        total: String(result.total),
        page: result.page,
        pages: result.pages,
        transactions: result.transactions.map(toTransactionMessage),
      };
    }, callback);
  },
};

function startGrpcServer() {
  const server = new grpc.Server();
  server.addService(billingProto.BillingService.service, handlers);
  const address = process.env.BILLING_GRPC_BIND_ADDRESS || '0.0.0.0:50051';

  server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error) => {
    if (error) {
      console.error('Failed to bind billing gRPC server:', error);
      process.exit(1);
    }
    server.start();
    console.log(`Billing gRPC server listening on ${address}`);
  });

  return server;
}

module.exports = { startGrpcServer };
