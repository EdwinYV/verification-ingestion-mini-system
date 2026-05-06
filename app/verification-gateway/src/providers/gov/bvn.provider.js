const GovProviderClient = require('./govClient');

module.exports = new GovProviderClient({
  endpoint: '/api/v1/bvn/verify',
  timeoutMs: 10000,
});
