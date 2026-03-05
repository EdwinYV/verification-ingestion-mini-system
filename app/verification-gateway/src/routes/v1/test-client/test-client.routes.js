const express = require('express');
const router = express.Router();
const testClientController = require('../../../modules/test-client/test-client.controller');
const auditController = require('../../../modules/audit/controller/audit.controller');
const rateLimit = require('../../../middlewares/rateLimit.middleware');
const validateQuery = require('../../../middlewares/validateQuery.middleware');
const { searchSchema } = require('../../../modules/audit/data/schema/search.schema');

// This route is intentionally unauthenticated for testing purposes

// 1. Queue a new verification job
// Apply rate limiting: 100 requests per minute
router.post('/verify', rateLimit('test-client-verify', 100), testClientController.testVerify);

// 2. Check the status of a verification job
// Apply rate limiting: 200 requests per minute (higher limit for polling)
router.get('/status/:id', rateLimit('test-client-status', 200), testClientController.testCheckStatus);

// 3. Search audit logs via Elasticsearch (unauthenticated test route)
router.get('/audit/search', rateLimit('test-client-audit-search', 100), validateQuery(searchSchema), auditController.searchVerificationLogs);

module.exports = router;
