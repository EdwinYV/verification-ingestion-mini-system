const BVN = require('../data/bvn.model');
const BaseVerificationService = require('../../BaseVerificationService');

class BVNService extends BaseVerificationService {
  constructor() {
    super('BVN', BVN, 'bvn');
  }
}

module.exports = new BVNService();
