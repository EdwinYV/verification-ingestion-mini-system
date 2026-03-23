const { grpc, billingProto } = require('./proto');
const billingService = require('../modules/billing/service/billing.service');
const env = require('../config/env');
const {
  grpcError,
  validateWalletRef,
  toWalletMessage,
  toTransactionMessage,
  SERVICE_TYPE_MAP,
} = require('./utils');
const { withGrpcTrace } = require('./interceptors');

class BillingGrpcHandler {


  async findOrCreateWallet(call, callback) {
    withGrpcTrace(call, 'FindOrCreateWallet', async () => {
      validateWalletRef(call.request.wallet);
      const { wallet, created } = await billingService.findOrCreateWallet(
        call.request.wallet.tenant,
        call.request.wallet.organizationId
      );
      return { wallet: toWalletMessage(wallet), created };
    }, callback);
  }

  async getBalance(call, callback) {
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
  }

  async fundWallet(call, callback) {
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
  }

  async chargeWallet(call, callback) {
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
  }

  async refundWallet(call, callback) {
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
  }

  async getHistory(call, callback) {
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
  }
}

function startGrpcServer() {
  const server = new grpc.Server();
  const handler = new BillingGrpcHandler();
  
  const implementation = {
    FindOrCreateWallet: handler.findOrCreateWallet.bind(handler),
    GetBalance: handler.getBalance.bind(handler),
    FundWallet: handler.fundWallet.bind(handler),
    ChargeWallet: handler.chargeWallet.bind(handler),
    RefundWallet: handler.refundWallet.bind(handler),
    GetHistory: handler.getHistory.bind(handler),
  };

  server.addService(billingProto.BillingService.service, implementation);
  const address = env.BILLING_GRPC_BIND_ADDRESS;

  server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => {
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
