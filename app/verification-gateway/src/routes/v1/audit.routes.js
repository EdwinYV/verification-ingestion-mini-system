const express = require('express');
const router = express.Router();
const auditController = require('../../modules/audit/controller/audit.controller');
const rateLimit = require('../../middlewares/rateLimit.middleware');
const validate = require('../../middlewares/validate.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const { searchSchema, reindexSchema } = require('../../modules/audit/data/schema/search.schema');


router.get('/history',rateLimit('audit-history', 100),auditController.getVerificationHistory);
router.get('/audit/search', rateLimit('audit-search', 100), validateQuery(searchSchema), auditController.searchVerificationLogs);
router.post('/audit/reindex', rateLimit('audit-reindex', 10), validate(reindexSchema), auditController.reindexVerificationLogs);

module.exports = router;
