const { VERIFICATION_TYPE, JOB_STATUS } = require('../constants/verification');
const { DEFAULT_MAX_RETRIES, getRetryDelayMs } = require('../retry/policy');

console.log('Shared constants:', VERIFICATION_TYPE, JOB_STATUS);
console.log('Retry policy:', { DEFAULT_MAX_RETRIES, delay0: getRetryDelayMs(0) });

