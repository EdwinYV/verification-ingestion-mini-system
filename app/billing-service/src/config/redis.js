const { createClient } = require('redis');
const env = require('./env');

const redisClient = createClient({
  url: env.BILLING_REDIS_URL,
});

redisClient.on('error', (err) => console.error('Billing Redis Client Error', err));

const connectRedis = async () => {
  await redisClient.connect();
  console.log('Connected to Redis (billing-service)');
};

module.exports = { redisClient, connectRedis };
