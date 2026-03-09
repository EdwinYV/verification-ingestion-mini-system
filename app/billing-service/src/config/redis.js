const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.BILLING_REDIS_URL || process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('Billing Redis Client Error', err));

const connectRedis = async () => {
  await redisClient.connect();
  console.log('Connected to Redis (billing-service)');
};

module.exports = { redisClient, connectRedis };
