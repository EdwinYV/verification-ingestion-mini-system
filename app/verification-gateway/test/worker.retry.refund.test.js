const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const workerPath = path.resolve(__dirname, '../src/workers/verification.worker');
const rabbitmqPath = path.resolve(__dirname, '../src/config/rabbitmq');
const verificationServicePath = path.resolve(
  __dirname,
  '../src/modules/verification/service/verification.service'
);
const verificationLogPath = path.resolve(
  __dirname,
  '../src/models/verification-log.model'
);
const billingServicePath = path.resolve(
  __dirname,
  '../src/modules/billing/service/billing.service'
);
const { DEFAULT_MAX_RETRIES } = require('../../shared/retry/policy');
const { JOB_STATUS } = require('../../shared/constants/verification');

function resetModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

test('worker refunds when retry limit is exceeded', async () => {
  const calls = {
    refund: [],
    updates: [],
    acks: 0,
    nacks: 0,
  };

  const fakeChannel = {
    handler: null,
    consume(queue, handler) {
      this.handler = handler;
    },
    ack() {
      calls.acks += 1;
    },
    nack() {
      calls.nacks += 1;
    },
  };

  resetModule(rabbitmqPath);
  require.cache[require.resolve(rabbitmqPath)] = {
    exports: {
      VERIFICATION_QUEUE: 'TEST_QUEUE',
      getChannel: () => fakeChannel,
      publishToRetryQueue: () => {},
    },
  };

  resetModule(verificationServicePath);
  require.cache[require.resolve(verificationServicePath)] = {
    exports: {
      processVerificationJob: async () => {
        throw new Error('dispatch failed');
      },
    },
  };

  resetModule(verificationLogPath);
  require.cache[require.resolve(verificationLogPath)] = {
    exports: {
      findByIdAndUpdate: async (logId, update) => {
        calls.updates.push({ logId, update });
        return null;
      },
      findById: async () => ({ retryCount: DEFAULT_MAX_RETRIES }),
    },
  };

  resetModule(billingServicePath);
  require.cache[require.resolve(billingServicePath)] = {
    exports: {
      refundWallet: async (clientOrganizationId, type, reference) => {
        calls.refund.push({ clientOrganizationId, type, reference });
        return { success: true };
      },
    },
  };

  resetModule(workerPath);
  const { startWorker } = require(workerPath);

  startWorker();

  const message = {
    properties: { headers: {} },
    content: Buffer.from(
      JSON.stringify({
        logId: 'log-1',
        type: 'NIN',
        clientOrganizationId: 'org-1',
      })
    ),
  };

  await fakeChannel.handler(message);

  assert.ok(calls.updates.some((entry) => entry.update.status === JOB_STATUS.FAILED));
  assert.equal(calls.refund.length, 1);
  assert.equal(calls.refund[0].clientOrganizationId, 'org-1');
  assert.equal(calls.refund[0].type, 'NIN');
  assert.equal(calls.nacks, 1);
});

test('worker retries when retry count is below the limit', async () => {
  const calls = {
    retry: [],
    updates: [],
    acks: 0,
    nacks: 0,
  };

  const fakeChannel = {
    handler: null,
    consume(queue, handler) {
      this.handler = handler;
    },
    ack() {
      calls.acks += 1;
    },
    nack() {
      calls.nacks += 1;
    },
  };

  resetModule(rabbitmqPath);
  require.cache[require.resolve(rabbitmqPath)] = {
    exports: {
      VERIFICATION_QUEUE: 'TEST_QUEUE',
      getChannel: () => fakeChannel,
      publishToRetryQueue: (payload, delay) => calls.retry.push({ payload, delay }),
    },
  };

  resetModule(verificationServicePath);
  require.cache[require.resolve(verificationServicePath)] = {
    exports: {
      processVerificationJob: async () => {
        throw new Error('temporary failure');
      },
    },
  };

  resetModule(verificationLogPath);
  require.cache[require.resolve(verificationLogPath)] = {
    exports: {
      findByIdAndUpdate: async (logId, update) => {
        calls.updates.push({ logId, update });
        return null;
      },
      findById: async () => ({ retryCount: 1 }),
    },
  };

  resetModule(billingServicePath);
  require.cache[require.resolve(billingServicePath)] = {
    exports: {
      refundWallet: async () => ({ success: true }),
    },
  };

  resetModule(workerPath);
  const { startWorker } = require(workerPath);

  startWorker();

  const message = {
    properties: { headers: {} },
    content: Buffer.from(
      JSON.stringify({
        logId: 'log-2',
        type: 'NIN',
        clientOrganizationId: 'org-2',
      })
    ),
  };

  await fakeChannel.handler(message);

  const pendingUpdate = calls.updates.find((entry) => entry.update.status === JOB_STATUS.PENDING);
  assert.ok(pendingUpdate);
  assert.equal(calls.retry.length, 1);
  assert.equal(calls.nacks, 0);
  assert.equal(calls.acks, 1);
});
