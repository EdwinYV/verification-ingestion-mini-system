const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(
  __dirname,
  '../src/modules/verification/service/verification.service'
);
const billingPath = path.resolve(
  __dirname,
  '../src/modules/billing/service/billing.service'
);
const redisPath = path.resolve(__dirname, '../src/config/redis');
const metricsPath = path.resolve(__dirname, '../src/utils/metrics.util');
const envPath = path.resolve(__dirname, '../src/config/env');
const rabbitmqPath = path.resolve(__dirname, '../src/config/rabbitmq');
const ninProviderPath = path.resolve(__dirname, '../src/providers/gov/nin.provider');
const bvnProviderPath = path.resolve(__dirname, '../src/providers/gov/bvn.provider');
const passportProviderPath = path.resolve(__dirname, '../src/providers/gov/passport.provider');
const dlProviderPath = path.resolve(__dirname, '../src/providers/gov/dl.provider');
const verificationLogPath = path.resolve(
  __dirname,
  '../src/models/verification-log.model'
);
const publisherPath = path.resolve(
  __dirname,
  '../src/modules/audit/search/search-index.publisher'
);

function resetModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

test('dispatch failure does not refund in processVerificationJob', async () => {
  const calls = {
    refund: 0,
    updates: [],
  };

  resetModule(billingPath);
  require.cache[require.resolve(billingPath)] = {
    exports: {
      chargeWallet: async () => ({ success: true }),
      refundWallet: async () => {
        calls.refund += 1;
        return { success: true };
      },
    },
  };

  resetModule(redisPath);
  require.cache[require.resolve(redisPath)] = {
    exports: {
      redisClient: {
        get: async () => null,
        set: async () => null,
      },
    },
  };

  resetModule(metricsPath);
  require.cache[require.resolve(metricsPath)] = {
    exports: {
      incrementMetric: () => {},
    },
  };

  resetModule(envPath);
  require.cache[require.resolve(envPath)] = {
    exports: {
      GATEWAY_BASE_URL: 'https://gateway.test',
    },
  };

  resetModule(rabbitmqPath);
  require.cache[require.resolve(rabbitmqPath)] = {
    exports: {
      publishToQueue: () => {},
    },
  };

  resetModule(ninProviderPath);
  require.cache[require.resolve(ninProviderPath)] = {
    exports: {
      verify: async () => {
        throw new Error('dispatch failed');
      },
    },
  };

  resetModule(bvnProviderPath);
  require.cache[require.resolve(bvnProviderPath)] = {
    exports: { verify: async () => ({ status: 202 }) },
  };

  resetModule(passportProviderPath);
  require.cache[require.resolve(passportProviderPath)] = {
    exports: { verify: async () => ({ status: 202 }) },
  };

  resetModule(dlProviderPath);
  require.cache[require.resolve(dlProviderPath)] = {
    exports: { verify: async () => ({ status: 202 }) },
  };

  resetModule(verificationLogPath);
  require.cache[require.resolve(verificationLogPath)] = {
    exports: {
      findByIdAndUpdate: async (logId, update) => {
        calls.updates.push({ logId, update });
        return null;
      },
    },
  };

  resetModule(publisherPath);
  require.cache[require.resolve(publisherPath)] = {
    exports: {
      enqueueVerificationLogIndex: async () => {},
    },
  };

  resetModule(servicePath);
  const verificationService = require(servicePath);

  await assert.rejects(
    () => verificationService.processVerificationJob({
      logId: 'log-3',
      type: 'NIN',
      id: 'NIN-001',
      mode: 'basic_identity',
      purpose: 'TEST',
      clientOrganizationId: 'org-3',
      idempotencyKey: 'idempo-3',
    }),
    /DISPATCH_FAILED/
  );

  assert.equal(calls.refund, 0);
});

