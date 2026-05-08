const { redisClient } = require('../config/redis');
const { BaseError, RateLimitError } = require('../../../shared/errors');
const env = require('../config/env');

const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window
const DEFAULT_MAX_REQUESTS = 100; // Default limit per window
const REDIS_OP_TIMEOUT_MS = env.RATE_LIMIT_REDIS_TIMEOUT_MS;

const withTimeout = (promise, timeoutMs, opName) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Rate limit ${opName} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

const rateLimit = (endpointName, maxRequests = DEFAULT_MAX_REQUESTS) => {
  return async (req, res, next) => {
    const clientId = req.headers['x-client-id'];

    if (!clientId) {
      // If no client ID, we can't rate limit per client.
      // Depending on requirements, we might skip or block.
      // For now, let's proceed but log a warning.
      console.warn('Rate Limit: No x-client-id header found. Skipping rate limit check.');
      return next();
    }

    const key = `ratelimit:${clientId}:${endpointName}`;

    try {
      const currentCount = await withTimeout(redisClient.incr(key), REDIS_OP_TIMEOUT_MS, 'INCR');

      if (currentCount === 1) {
        await withTimeout(redisClient.expire(key, RATE_LIMIT_WINDOW_SECONDS), REDIS_OP_TIMEOUT_MS, 'EXPIRE');
      }

      const ttl = await withTimeout(redisClient.ttl(key), REDIS_OP_TIMEOUT_MS, 'TTL');

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + ttl);

      if (currentCount > maxRequests) {
        throw new RateLimitError('Too many requests, please try again later.', 'RATE_LIMIT_EXCEEDED');
      }

      next();
    } catch (error) {
      if (error instanceof BaseError) {
        next(error);
      } else {
        console.error('Rate Limit Redis Error:', error);
        // Fail open: If Redis is down, allow the request to proceed (graceful degradation)
        next();
      }
    }
  };
};

module.exports = rateLimit;
