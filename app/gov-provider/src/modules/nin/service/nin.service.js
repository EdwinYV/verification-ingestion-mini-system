const NIN = require('../data/nin.model');
const BaseVerificationService = require('../../BaseVerificationService');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

class NINService extends BaseVerificationService {
  constructor() {
    super({
      verificationType: VERIFICATION_TYPE.NIN,
      model: NIN,
      searchField: 'nin',
    });
  }
}

module.exports = new NINService();
