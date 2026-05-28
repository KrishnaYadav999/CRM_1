const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sendMail } = require('../utils/mailer');
const { ROLES } = require('../constants/roles');

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function readAvatarUrl(value) {
  if (value === undefined || value === null || value === '') return '';

  const avatarUrl = String(value);
  const isImageDataUrl = /^data:image\/(png|jpe?g|webp);base64,/i.test(avatarUrl);
  if (!isImageDataUrl) {
    const error = new Error('Profile image must be PNG, JPG, JPEG, or WEBP');
    error.statusCode = 400;
    throw error;
  }

  const sizeInBytes = Math.ceil((avatarUrl.length * 3) / 4);
  if (sizeInBytes > 2 * 1024 * 1024) {
    const error = new Error('Profile image must be under 2MB');
    error.statusCode = 400;
    throw error;
  }

  return avatarUrl;
}

exports.requestOtp = async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!password) return res.status(400).json({ error: 'Password required' });
  let user = await User.findOne({ email });
  if (!user) {
    // user accounts are created by admin only
    return res.status(404).json({ error: 'User not found. Contact admin.' });
  }

  if (!user.isActive) return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });

  if (user.password) {
    const matches = await bcrypt.compare(password, user.password);
    if (!matches) return res.status(401).json({ error: 'Invalid email or password' });
  } else {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    user.password = await bcrypt.hash(password, 10);
  }

  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();

  const html = `<p>Your e-Connect login OTP is <b>${otp}</b>.</p><p>It expires in 10 minutes.</p>`;
  try {
    await sendMail(user.email, 'Your Login OTP', html);
  } catch (err) {
    console.error('Mail error', err);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ error: 'Could not send OTP email. Check SMTP env settings.' });
    }
  }
  return res.json({ ok: true, message: 'OTP sent if email exists' });
};

exports.verifyOtp = async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const otp = String(req.body.otp || '').trim();
  if (!email || !password || !otp) return res.status(400).json({ error: 'Email, password and otp required' });
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.isActive) return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });
  if (!user.password) return res.status(400).json({ error: 'Password is not set. Contact admin.' });

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) return res.status(401).json({ error: 'Invalid email or password' });

  if (!user.otp || user.otp !== otp) return res.status(400).json({ error: 'Invalid otp' });
  if (user.otpExpires < Date.now()) return res.status(400).json({ error: 'OTP expired' });

  // clear otp
  user.otp = undefined;
  user.otpExpires = undefined;
  user.lastLogin = new Date();
  await user.save();

  const token = jwt.sign({ sub: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
  res.json({ ok: true, token, user: publicUser(user) });
};

exports.createUserByAdmin = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const role = String(req.body.role || '').trim();
  const team = String(req.body.team || 'No team assigned').trim();
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);
  let avatarUrl = '';

  try {
    avatarUrl = readAvatarUrl(req.body.avatarUrl);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!email || !role) return res.status(400).json({ error: 'Email and role required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  let existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'User already exists' });
  const user = new User({ name, email, role, team, isActive, avatarUrl, createdBy: req.user?._id });
  await user.save();
  res.status(201).json({ ok: true, user: publicUser(user) });
};

exports.updateUserByAdmin = async (req, res) => {
  const userId = req.params.id;
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const role = String(req.body.role || '').trim();
  const team = String(req.body.team || 'No team assigned').trim();
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);
  let avatarUrl;

  try {
    if (req.body.avatarUrl !== undefined) avatarUrl = readAvatarUrl(req.body.avatarUrl);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!email || !role) return res.status(400).json({ error: 'Email and role required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const duplicate = await User.findOne({ email, _id: { $ne: userId } });
  if (duplicate) return res.status(400).json({ error: 'Email already exists' });

  user.name = name;
  user.email = email;
  user.role = role;
  user.team = team;
  user.isActive = isActive;
  if (req.body.avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  await user.save();

  res.json({ ok: true, user: publicUser(user) });
};

exports.me = async (req, res) => {
  res.json({ ok: true, user: publicUser(req.user) });
};

exports.updateMe = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  let avatarUrl;

  try {
    avatarUrl = readAvatarUrl(req.body.avatarUrl);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!email) return res.status(400).json({ error: 'Email required' });

  const duplicate = await User.findOne({ email, _id: { $ne: req.user._id } });
  if (duplicate) return res.status(400).json({ error: 'Email already exists' });

  req.user.name = name;
  req.user.email = email;
  if (req.body.avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;
  await req.user.save();

  res.json({ ok: true, user: publicUser(req.user) });
};

exports.updatePassword = async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Password confirmation does not match' });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.password) {
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) return res.status(400).json({ error: 'Current password is incorrect' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ ok: true, message: 'Password updated successfully' });
};

exports.listUsers = async (req, res) => {
  const users = await User.find().select('-otp -otpExpires -password').sort({ createdAt: -1 });
  res.json({ ok: true, users });
};

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    team: user.team,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
