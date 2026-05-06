const DEFAULT_MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function getRetryDelayMs(retryCount) {
  return Math.pow(2, retryCount) * BASE_DELAY_MS;
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  getRetryDelayMs,
};

