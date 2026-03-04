const VerificationLog = require('../../../models/verification-log.model');
const { enqueueVerificationLogIndex } = require('../search/search-index.publisher');

class ReindexService {
  async enqueueReindex({ from, to, batchSize = 500 }) {
    const query = {};
    if (from || to) {
      query.requestedAt = {};
      if (from) query.requestedAt.$gte = new Date(from);
      if (to) query.requestedAt.$lte = new Date(to);
    }

    const total = await VerificationLog.countDocuments(query);
    const cursor = VerificationLog.find(query).sort({ _id: 1 }).cursor();

    let queued = 0;
    for await (const log of cursor) {
      enqueueVerificationLogIndex(log._id, 'reindex');
      queued += 1;

      if (queued % batchSize === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    return { total, queued };
  }
}

module.exports = new ReindexService();
