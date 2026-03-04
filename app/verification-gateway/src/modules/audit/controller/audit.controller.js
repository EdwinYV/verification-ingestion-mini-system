const auditService = require('../service/audit.service');
const auditSearchService = require('../service/audit.search.service');
const reindexService = require('../service/reindex.service');

exports.getVerificationHistory = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await auditService.getHistory(page, limit);

    res.json({
      status: 'success',
      meta: result.meta,
      data: result.logs
    });

  } catch (error) {
    console.error('History Log Error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to retrieve verification history' 
    });
  }
};

exports.searchVerificationLogs = async (req, res) => {
  try {
    const result = await auditSearchService.search(req.validatedQuery || req.query);
    res.json({
      status: 'success',
      meta: result.meta,
      aggregations: result.aggregations,
      data: result.data,
    });
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search verification logs',
    });
  }
};

exports.reindexVerificationLogs = async (req, res) => {
  try {
    const { from, to, batchSize } = req.body;
    const result = await reindexService.enqueueReindex({ from, to, batchSize });
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    console.error('Reindex Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to enqueue reindex job',
    });
  }
};
