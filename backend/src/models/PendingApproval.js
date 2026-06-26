const mongoose = require('mongoose');

const PendingApprovalSchema = new mongoose.Schema({
  type: { type: String, enum: ['client', 'quotation'], default: 'client', index: true },
  source: { type: String, trim: true, default: 'crm', index: true },
  sourceClientId: { type: String, trim: true, index: true },
  uniqueId: { type: String, trim: true, index: true },
  clientName: { type: String, trim: true },
  approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  piboCategory: { type: String, trim: true },
  eprCategory: { type: String, trim: true },
  createdByName: { type: String, trim: true },
  requestDate: { type: String, trim: true },
  requestTime: { type: String, trim: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastReminderAt: { type: Date },
  nextReminderAt: { type: Date, index: true },
  reminderCount: { type: Number, default: 0 },
  reminderError: { type: String, trim: true },
  notifiedAdminEmails: [{ type: String, lowercase: true, trim: true }],
  actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actionAt: { type: Date },
  remarks: { type: String, trim: true }
}, { timestamps: true });

PendingApprovalSchema.index(
  { type: 1, source: 1, sourceClientId: 1 },
  { unique: true, partialFilterExpression: { sourceClientId: { $exists: true, $gt: '' } } }
);

PendingApprovalSchema.index(
  { type: 1, source: 1, uniqueId: 1 },
  { partialFilterExpression: { uniqueId: { $type: 'string' } } }
);

module.exports = mongoose.model('PendingApproval', PendingApprovalSchema);
