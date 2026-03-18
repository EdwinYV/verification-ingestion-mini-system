const NIN = require('../data/nin.model');
const BaseVerificationService = require('../../BaseVerificationService');

class NINService extends BaseVerificationService {
  constructor() {
    super('NIN', NIN, 'nin');
  }
}

module.exports = new NINService();
