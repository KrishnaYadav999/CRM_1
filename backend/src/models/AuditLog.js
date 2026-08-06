const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, index: true },
  action: { type: String, required: true, trim: true, index: true },
  module: { type: String, required: true, trim: true, index: true },
  method: { type: String, trim: true },
  path: { type: String, trim: true },
  statusCode: { type: Number },
  description: { type: String, trim: true },
  ipAddress: { type: String, trim: true },
  occurredAt: { type: Date, required: true, default: Date.now, index: true }
}, { timestamps: true });

AuditLogSchema.index({ userId: 1, occurredAt: -1 });
module.exports = mongoose.model('AuditLog', AuditLogSchema);
