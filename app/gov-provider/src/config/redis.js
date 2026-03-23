const { createClient } = require('redis');
const env = require('./env');

const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis (Billing Service)');
  } catch (error) {
    console.error('Redis connection error:', error);
  }
};

module.exports = { redisClient, connectRedis };
