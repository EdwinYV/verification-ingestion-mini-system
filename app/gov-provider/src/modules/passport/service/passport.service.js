const Passport = require('../data/passport.model');
const BaseVerificationService = require('../../BaseVerificationService');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

class PassportService extends BaseVerificationService {
  constructor() {
    super({
      verificationType: VERIFICATION_TYPE.PASSPORT,
      model: Passport,
      searchField: 'passportNumber',
    });
  }
}

module.exports = new PassportService();
