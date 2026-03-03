const Organization = require('../models/Organization.model');
const { verifySignature } = require('../security/hmac.util');
const mongoose = require('mongoose');

const AUTH_DB_QUERY_TIMEOUT_MS = Number(process.env.AUTH_DB_QUERY_TIMEOUT_MS || 3000);

const authenticate = async (req, res, next) => {
  try {
    const clientId = req.headers['x-client-id'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!clientId || !signature || !timestamp) {
      return res.status(401).json({
        code: 'AUTH401',
        message: 'MISSING AUTHENTICATION HEADERS (x-client-id, x-timestamp, x-signature)'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        code: 'AUTH503',
        message: 'AUTHENTICATION SERVICE UNAVAILABLE'
      });
    }

    const organization = await Organization.findOne({ clientId })
      .maxTimeMS(AUTH_DB_QUERY_TIMEOUT_MS)
      .exec();

    if (!organization) {
      return res.status(401).json({
        code: 'AUTH401',
        message: 'INVALID CLIENT ID'
      });
    }

    if (organization.status !== 'ACTIVE') {
      return res.status(403).json({
        code: 'AUTH403',
        message: 'ORGANIZATION SUSPENDED'
      });
    }

    // Construct the payload string exactly as the client will
    // This removes JSON.stringify inconsistencies
    const payloadString = `${clientId}.${timestamp}`;
    
    const isValid = verifySignature(payloadString, organization.clientSecret, signature);

    if (!isValid) {
      return res.status(401).json({
        code: 'AUTH401',
        message: 'INVALID SIGNATURE'
      });
    }

    req.organization = organization;
    next();
  } catch (error) {
    console.error('Auth Error:', error);
    if (
      error?.name === 'MongoServerSelectionError' ||
      error?.name === 'MongooseServerSelectionError' ||
      error?.name === 'MongoNetworkError'
    ) {
      return res.status(503).json({
        code: 'AUTH503',
        message: 'AUTHENTICATION SERVICE UNAVAILABLE'
      });
    }

    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'INTERNAL SERVER ERROR'
    });
  }
};

module.exports = authenticate;
