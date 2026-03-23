const axios = require('axios');
const crypto = require('crypto');
const env = require('../../config/env');

class DLProvider {
  constructor() {
    this.baseUrl = env.GOV_PROVIDER_URL;
    this.clientId = env.GOV_CLIENT_ID;
    this.clientSecret = env.GOV_CLIENT_SECRET;
  }


  generateSignature(timestamp) {
    const payloadString = `${this.clientId}.${timestamp}`;
    return crypto
        .createHmac('sha256', this.clientSecret)
        .update(payloadString)
        .digest('hex');
  }

  async verify(id, mode = 'basic_identity', purpose = 'IDENTITY_VERIFICATION', callbackUrl, verificationId) {
    try {
      const timestamp = Date.now().toString();
      const requestBody = {
        id,
        mode,
        purpose,
        consent: true,
        callbackUrl,
        verificationId,
      };
      const signature = this.generateSignature(timestamp);
      const idempotencyKey = crypto.randomUUID();

      const response = await axios.post(`${this.baseUrl}/api/v1/drivers-license/verify`, requestBody, {
        headers: { 
          'x-client-id': this.clientId,
          'x-timestamp': timestamp,
          'x-signature': signature,
          'x-idempotency-key': idempotencyKey
        },
        timeout: 10000
      });
      return response;
    } catch (error) {
      if (error.response) {
        const customError = new Error(error.response.data.message || error.response.statusText);
        customError.statusCode = error.response.status;
        customError.code = error.response.data.code;
        throw customError;
      }
      throw new Error(`Drivers License Verification failed: ${error.message}`);
    }
  }
}

module.exports = new DLProvider();
