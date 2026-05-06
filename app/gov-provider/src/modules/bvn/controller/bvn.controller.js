const { createVerificationHandler } = require('../../verification/controller/verification.controllerFactory');
const { VERIFICATION_TYPE } = require('../../../../../shared/constants/verification');

exports.verifyBVN = createVerificationHandler(VERIFICATION_TYPE.BVN);
