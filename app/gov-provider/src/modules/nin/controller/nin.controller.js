const { createVerificationHandler } = require('../../verification/controller/verification.controllerFactory');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

exports.verifyNIN = createVerificationHandler(VERIFICATION_TYPE.NIN);
