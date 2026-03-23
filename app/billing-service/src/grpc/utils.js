const { grpc } = require('./proto');

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

module.exports = {
  SERVICE_TYPE_MAP,
  WALLET_STATUS_MAP,
  TX_TYPE_MAP,
  grpcError,
  mapDomainError,
  metadataToCarrier,
  validateWalletRef,
  toWalletMessage,
  toTransactionMessage,
};
