const crypto = require('crypto');
const env = require('../config/env');

// In a real scenario, this secret would be shared securely
const WEBHOOK_SECRET = env.WEBHOOK_SECRET;

const verifyWebhookSignature = (payload, signature) => {
  // For the simulation, we just check if the signature matches our hardcoded secret
  // In production, you would HMAC the payload with the secret
  return signature === WEBHOOK_SECRET;
};

module.exports = {
  verifyWebhookSignature
};
