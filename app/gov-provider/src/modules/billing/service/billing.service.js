const path = require('path');
const env = require('../../../config/env');
const { createBillingClient } = require('../../../../shared/billing/grpcClient');

const TENANT = 'gov-provider';
const PROTO_PATH = path.resolve(__dirname, '../../../grpc/proto/billing.proto');

module.exports = createBillingClient({
  tenant: TENANT,
  tracerName: 'gov-provider',
  billingGrpcAddr: env.BILLING_GRPC_ADDR,
  deadlineMs: env.BILLING_GRPC_DEADLINE_MS,
  protoPath: PROTO_PATH,
});

