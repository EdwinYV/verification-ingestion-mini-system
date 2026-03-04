const { redisClient } = require('../config/redis');

const incrementMetric = async (metricType) => {
  try {
    await redisClient.incr(`metrics:cache:${metricType}`);
  } catch (redisError) {
    console.error(`Failed to increment metric ${metricType} (graceful degradation):`, redisError);
  }
};

const getMetrics = async () => {
  try {
    const [hits, misses] = await redisClient.mGet([
      'metrics:cache:hits',
      'metrics:cache:misses',
    ]);
    return {
      cache: {
        hits: Number(hits || 0),
        misses: Number(misses || 0),
      },
    };
  } catch (redisError) {
    console.error('Failed to read metrics (graceful degradation):', redisError);
    return { cache: { hits: 0, misses: 0 } };
  }
};

module.exports = {
  incrementMetric,
  getMetrics,
};
