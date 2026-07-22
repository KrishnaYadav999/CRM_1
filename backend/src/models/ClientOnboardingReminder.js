const mongoose = require('mongoose');

const ClientOnboardingReminderSchema = new mongoose.Schema({
  ccpClientId: { type: String, required: true, unique: true, index: true, trim: true },
  uniqueId: { type: String, trim: true, index: true },
  clientName: { type: String, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  firstBasicInfoAt: { type: Date, required: true, index: true },
  lastSavedAt: { type: Date, default: Date.now },
  filledCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  filledFields: [{ type: String }],
  missingFields: [{ type: String }],
  completed: { type: Boolean, default: false, index: true },
  remindedAt: { type: Date, index: true },
  source: { type: String, default: 'manual-lead-conversion' }
}, { timestamps: true });

ClientOnboardingReminderSchema.index({ completed: 1, remindedAt: 1, firstBasicInfoAt: 1 });
module.exports = mongoose.model('ClientOnboardingReminder', ClientOnboardingReminderSchema);
