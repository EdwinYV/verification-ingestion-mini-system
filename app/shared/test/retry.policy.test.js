const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_MAX_RETRIES, getRetryDelayMs } = require('../retry/policy');

test('retry policy uses exponential backoff in seconds', () => {
  assert.equal(DEFAULT_MAX_RETRIES, 5);
  assert.equal(getRetryDelayMs(0), 1000);
  assert.equal(getRetryDelayMs(1), 2000);
  assert.equal(getRetryDelayMs(2), 4000);
});

