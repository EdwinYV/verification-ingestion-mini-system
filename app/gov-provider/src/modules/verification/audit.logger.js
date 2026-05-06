const AuditLog = require('../../models/AuditLog.model');

class AuditLogger {
  async log({ organizationId, verificationType, searchId, purpose, mode, status, fieldsAccessed }) {
    return AuditLog.create({
      organizationId,
      verificationType,
      searchId,
      purpose,
      mode,
      status,
      fieldsAccessed,
    });
  }
}

module.exports = new AuditLogger();

