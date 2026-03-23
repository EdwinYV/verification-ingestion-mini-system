const { createClient } = require('redis');
const env = require('./env');

const redisClient = createClient({
  url: env.REDIS_URL_GATEWAY,
});

redisClient.on('error', (err) => console.error('Gateway Redis Client Error', err));

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis (Gateway Billing)');
  } catch (error) {
    console.error('Gateway Redis connection error:', error);
  }
};

module.exports = { redisClient, connectRedis };
