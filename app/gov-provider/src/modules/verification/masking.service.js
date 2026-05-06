const { maskData } = require('../../privacy/masking.util');

class MaskingService {
  mask(record, mode) {
    return maskData(record, mode);
  }
}

module.exports = new MaskingService();

