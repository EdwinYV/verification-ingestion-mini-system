const VerificationLog = require('../../../models/verification-log.model');
const { getElasticsearchClient, verificationLogIndex } = require('../../../config/elasticsearch');
const { mapVerificationLogToDocument } = require('../search/verification-log.transform');

class SearchIndexService {
  async indexById(logId) {
    const log = await VerificationLog.findById(logId);
    if (!log) {
      return { indexed: false, reason: 'NOT_FOUND' };
    }

    const client = getElasticsearchClient();
    const document = mapVerificationLogToDocument(log);

    await client.index({
      index: verificationLogIndex.index,
      id: document.verificationId,
      document,
      refresh: false,
    });

    return { indexed: true };
  }
}

module.exports = new SearchIndexService();
