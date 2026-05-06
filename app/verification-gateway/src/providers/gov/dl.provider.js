const GovProviderClient = require('./govClient');

module.exports = new GovProviderClient({
  endpoint: '/api/v1/drivers-license/verify',
  timeoutMs: 10000,
});
