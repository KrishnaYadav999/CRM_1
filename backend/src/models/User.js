const mongoose = require('mongoose');
const { ROLES } = require('../constants/roles');

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  crmUserId: { type: String, unique: true, sparse: true, trim: true },
  ccpUserId: { type: String, unique: true, sparse: true, trim: true },
  source: { type: String, trim: true, default: 'crm' },
  password: { type: String }, // used for seeded admin only
  avatarUrl: { type: String },
  role: { type: String, enum: ROLES, default: 'operation' },
  team: { type: String, default: 'No team assigned' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  operationHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastLogin: { type: Date },
  otp: { type: String },
  otpExpires: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
