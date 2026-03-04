const Joi = require('joi');

const searchSchema = Joi.object({
  q: Joi.string().allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'),
  type: Joi.string().max(50),
  mode: Joi.string().max(50),
  clientOrganizationId: Joi.string().max(64),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
});

const reindexSchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  batchSize: Joi.number().integer().min(10).max(5000).default(500),
});

module.exports = { searchSchema, reindexSchema };
