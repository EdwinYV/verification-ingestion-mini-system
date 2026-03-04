const verificationLogIndex = {
  index: 'verification_logs_v1',
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    dynamic: 'strict',
    properties: {
      verificationId: { type: 'keyword' },
      verificationType: { type: 'keyword' },
      searchId: { type: 'keyword' },
      mode: { type: 'keyword' },
      status: { type: 'keyword' },
      provider: { type: 'keyword' },
      clientOrganizationId: { type: 'keyword' },
      idempotencyKey: { type: 'keyword' },
      requestedAt: { type: 'date' },
      completedAt: { type: 'date' },
      errorMessage: { type: 'text' },
      searchText: { type: 'text' },
      responsePayload: { type: 'object', enabled: false },
    },
  },
};

module.exports = { verificationLogIndex };
