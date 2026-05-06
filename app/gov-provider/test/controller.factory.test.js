const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const factoryPath = path.resolve(
  __dirname,
  '../src/modules/verification/controller/verification.controllerFactory'
);
const rabbitmqPath = path.resolve(__dirname, '../src/config/rabbitmq');
const { VERIFICATION_TYPE } = require('../../shared/constants/verification');

function resetModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

test('controller factory publishes a job and returns 202', async () => {
  const published = [];

  resetModule(rabbitmqPath);
  require.cache[require.resolve(rabbitmqPath)] = {
    exports: {
      publishToQueue: (payload) => published.push(payload),
    },
  };

  resetModule(factoryPath);
  const { createVerificationHandler } = require(factoryPath);

  const handler = createVerificationHandler(VERIFICATION_TYPE.NIN);
  const req = {
    body: {
      id: 'NIN-123',
      mode: 'basic_identity',
      purpose: 'TEST_PURPOSE',
      callbackUrl: 'https://example.com/webhook',
      verificationId: 'verif-1',
    },
    organization: { _id: 'org-1' },
    headers: { 'x-idempotency-key': 'idempo-1' },
  };

  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };

  await handler(req, res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.status, 'PENDING');
  assert.equal(published.length, 1);
  assert.deepEqual(published[0], {
    type: VERIFICATION_TYPE.NIN,
    id: 'NIN-123',
    mode: 'basic_identity',
    purpose: 'TEST_PURPOSE',
    organizationId: 'org-1',
    idempotencyKey: 'idempo-1',
    callbackUrl: 'https://example.com/webhook',
    verificationId: 'verif-1',
  });
});
