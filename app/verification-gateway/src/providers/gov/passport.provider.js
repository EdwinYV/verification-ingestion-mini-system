const GovProviderClient = require('./govClient');

module.exports = new GovProviderClient({
  endpoint: '/api/v1/passport/verify',
  timeoutMs: 10000,
});
