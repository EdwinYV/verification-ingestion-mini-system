const Passport = require('../data/passport.model');
const BaseVerificationService = require('../../BaseVerificationService');

class PassportService extends BaseVerificationService {
  constructor() {
    super('PASSPORT', Passport, 'passportNumber');
  }
}

module.exports = new PassportService();
