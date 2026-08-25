const mongoose = require('mongoose');

const MilestoneAcknowledgementSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  seenAt: { type: Date, required: true, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  crmUserId: { type: String, unique: true, sparse: true, trim: true },
  source: { type: String, trim: true, default: 'crm' },
  password: { type: String }, // used for seeded admin only
  avatarUrl: { type: String },
  role: { type: String, trim: true, default: 'operation', index: true },
  team: { type: String, default: 'No team assigned' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  operationHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastLogin: { type: Date },
  otp: { type: String },
  otpExpires: { type: Date },
  passwordResetOtp: { type: String },
  passwordResetExpires: { type: Date },
  passwordResetRequestedAt: { type: Date },
  passwordResetAttempts: { type: Number, default: 0, select: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  milestoneAcknowledgements: { type: [MilestoneAcknowledgementSchema], default: [] }
}, { timestamps: true });

UserSchema.index({ _id: 1, 'milestoneAcknowledgements.key': 1 });

module.exports = mongoose.model('User', UserSchema);
