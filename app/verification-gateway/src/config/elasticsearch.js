const { Client } = require('@elastic/elasticsearch');
const { verificationLogIndex } = require('../modules/audit/search/verification-log.index');

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

let esClient = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectElasticsearch = async () => {
  esClient = new Client({ node: ELASTICSEARCH_URL });

  const maxAttempts = Number(process.env.ELASTICSEARCH_CONNECT_RETRIES || 10);
  const baseDelayMs = Number(process.env.ELASTICSEARCH_CONNECT_DELAY_MS || 1000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await esClient.ping();
      const health = await esClient.cluster.health();
      console.log(`Connected to Elasticsearch (status: ${health.status})`);
      return esClient;
    } catch (error) {
      console.error(`Elasticsearch connection attempt ${attempt}/${maxAttempts} failed:`, error.message);
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(baseDelayMs * attempt);
    }
  }
};

const getElasticsearchClient = () => {
  if (!esClient) {
    throw new Error('Elasticsearch client not initialized');
  }
  return esClient;
};

const ensureVerificationLogIndex = async () => {
  const client = getElasticsearchClient();
  const { index, settings, mappings } = verificationLogIndex;
  const exists = await client.indices.exists({ index });
  if (!exists) {
    await client.indices.create({ index, settings, mappings });
    console.log(`Elasticsearch index created: ${index}`);
  }
};

module.exports = {
  connectElasticsearch,
  getElasticsearchClient,
  ensureVerificationLogIndex,
  verificationLogIndex,
};
