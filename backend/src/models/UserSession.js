const mongoose = require('mongoose');

const UserSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  loginAt: { type: Date, required: true, default: Date.now, index: true },
  lastActivityAt: { type: Date, required: true, default: Date.now },
  logoutAt: { type: Date },
  ipAddress: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  loginMode: { type: String, trim: true },
  activityCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('UserSession', UserSessionSchema);
