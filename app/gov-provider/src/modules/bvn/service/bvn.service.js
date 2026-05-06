const BVN = require('../data/bvn.model');
const BaseVerificationService = require('../../BaseVerificationService');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

class BVNService extends BaseVerificationService {
  constructor() {
    super({
      verificationType: VERIFICATION_TYPE.BVN,
      model: BVN,
      searchField: 'bvn',
    });
  }
}

module.exports = new BVNService();
