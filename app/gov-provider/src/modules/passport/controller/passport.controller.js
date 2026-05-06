const { createVerificationHandler } = require('../../verification/controller/verification.controllerFactory');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

exports.verifyPassport = createVerificationHandler(VERIFICATION_TYPE.PASSPORT);
