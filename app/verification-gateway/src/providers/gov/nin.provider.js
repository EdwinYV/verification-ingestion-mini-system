const GovProviderClient = require('./govClient');

module.exports = new GovProviderClient({
  endpoint: '/api/v1/nin/verify',
  timeoutMs: 30000,
});
