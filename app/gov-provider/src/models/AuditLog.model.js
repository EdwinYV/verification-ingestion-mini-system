const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  verificationType: { type: String, index: true },
  searchId: { type: String, index: true },
  purpose: { type: String },
  mode: { type: String },
  status: { type: String },
  fieldsAccessed: { type: [String], default: [] },
  timestamp: { type: Date, default: Date.now, index: true }
}, { strict: false });

// Composite index for common filtering scenario
auditLogSchema.index({ organizationId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);