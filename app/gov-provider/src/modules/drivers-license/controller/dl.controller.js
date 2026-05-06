const { createVerificationHandler } = require('../../verification/controller/verification.controllerFactory');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

exports.verifyDL = createVerificationHandler(VERIFICATION_TYPE.DRIVERS_LICENSE);
