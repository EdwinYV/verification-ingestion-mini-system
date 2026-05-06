const DriversLicense = require('../data/dl.model');
const BaseVerificationService = require('../../BaseVerificationService');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

class DLService extends BaseVerificationService {
  constructor() {
    super({
      verificationType: VERIFICATION_TYPE.DRIVERS_LICENSE,
      model: DriversLicense,
      searchField: 'licenseNumber',
    });
  }
}

module.exports = new DLService();
