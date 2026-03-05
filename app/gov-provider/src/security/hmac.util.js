const crypto = require('crypto');

const generateSignature = (payloadString, secret) => {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
};

const verifySignature = (payloadString, secret, signature) => {
  const expectedSignature = generateSignature(payloadString, secret);

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

module.exports = {
  generateSignature,
  verifySignature
};