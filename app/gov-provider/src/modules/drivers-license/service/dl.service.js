const DriversLicense = require('../data/dl.model');
const BaseVerificationService = require('../../BaseVerificationService');

class DLService extends BaseVerificationService {
  constructor() {
    super('DRIVERS_LICENSE', DriversLicense, 'licenseNumber');
  }
}

module.exports = new DLService();
