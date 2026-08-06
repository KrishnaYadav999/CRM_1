const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { activityAudit } = require('./activityAudit');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(payload.sub).select('-otp -otpExpires -password');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User is not active' });
    }

    req.user = user;
    req.authSessionId = payload.sid || '';
    activityAudit(req, res, next);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRoles(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this action' });
    }

    next();
  };
}

module.exports = { requireAuth, requireRoles };
