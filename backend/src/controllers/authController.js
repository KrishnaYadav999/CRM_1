const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getMailDebugConfig, sendMail } = require('../utils/mailer');
const { syncUserToCcp, syncUsersToCcp } = require('../utils/ccpUserSync');
const { ROLES } = require('../constants/roles');

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const APP_NAME = 'CRM';

function shouldSkipMailInDevelopment() {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.OTP_EMAILS_ENABLED === 'true') return false;
  const mailPass = process.env.SMTP_PASS || process.env.MAIL_PASS || process.env.EMAIL_PASS || process.env.GMAIL_PASS || '';
  const hasUsableSmtp = Boolean(process.env.SMTP_HOST && mailPass && !isPlaceholderMailSecret(mailPass));
  return !hasUsableSmtp;
}

function isPlaceholderMailSecret(value) {
  return /change_me|your-|placeholder/i.test(String(value || ''));
}

async function sendLoginOtp(user, otp, context = {}) {
  if (shouldSkipMailInDevelopment()) {
    console.log(`Development OTP for ${user.email}: ${otp}`);
    return { ok: true, message: 'OTP generated for development.', devOtp: otp };
  }

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${APP_NAME} Login OTP</title>
      </head>
      <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;margin:0;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;overflow:hidden;border-radius:18px;background:#ffffff;box-shadow:0 18px 50px rgba(15,23,42,0.12);">
                <tr>
                  <td style="background:#0f766e;padding:26px 28px;color:#ffffff;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.86;">Secure Login</div>
                    <div style="margin-top:8px;font-size:28px;font-weight:800;line-height:1.2;">${APP_NAME}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 28px 30px;">
                    <h1 style="margin:0;font-size:24px;line-height:1.3;color:#0f172a;">Your login OTP</h1>
                    <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#475569;">Use this one-time password to complete your CRM sign in. This code is valid for the next 10 minutes.</p>
                    <div style="margin:26px 0;padding:20px;border-radius:16px;background:#ecfeff;border:1px solid #99f6e4;text-align:center;">
                      <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#0f766e;">OTP Code</div>
                      <div style="margin-top:8px;font-size:38px;font-weight:800;letter-spacing:0.18em;color:#0f172a;">${otp}</div>
                    </div>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">If you did not request this OTP, you can safely ignore this email. Do not share this code with anyone.</p>
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid #e2e8f0;padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.6;">
                    This is an automated security email from ${APP_NAME}.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    const mailResult = await sendMail(user.email, context.resend ? `${APP_NAME} New Login OTP` : `${APP_NAME} Login OTP`, html);
    console.info('OTP mail sent', {
      email: user.email,
      action: context.resend ? 'resend' : 'request',
      mail: mailResult.summary,
      config: getMailDebugConfig()
    });
    return { ok: true, message: 'OTP sent to your registered email.' };
  } catch (err) {
    console.error('OTP mail error', {
      email: user.email,
      action: context.resend ? 'resend' : 'request',
      code: err.code,
      command: err.command,
      responseCode: err.responseCode,
      response: err.response,
      message: err.message,
      config: getMailDebugConfig()
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Development OTP for ${user.email}: ${otp}`);
      return { ok: true, message: 'OTP generated. SMTP failed in development.', devOtp: otp };
    }

    const mailPass = process.env.SMTP_PASS || process.env.MAIL_PASS || process.env.EMAIL_PASS || process.env.GMAIL_PASS;
    const configHint = !process.env.SMTP_HOST || !mailPass || isPlaceholderMailSecret(mailPass)
      ? ' SMTP is not configured correctly.'
      : '';
    const error = new Error(`OTP email could not be sent.${configHint}`);
    error.statusCode = 502;
    throw error;
  }
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

function readObjectId(value) {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : undefined;
}

function readCcpUserIdFromSync(syncResult) {
  const payload = syncResult?.response || {};
  const candidates = [
    payload.ccpUserId,
    payload.user?.ccpUserId,
    payload.user?.id,
    payload.user?._id,
    payload.data?.ccpUserId,
    payload.data?.id,
    payload.data?._id,
    payload.id,
    payload._id
  ];

  return String(candidates.find(Boolean) || '').trim();
}

async function saveSyncedCcpUserId(user, syncResult) {
  if (!user || syncResult?.ok === false) return;

  const ccpUserId = readCcpUserIdFromSync(syncResult);
  if (!ccpUserId || String(user.ccpUserId || '') === ccpUserId) return;

  const duplicate = await User.findOne({ ccpUserId, _id: { $ne: user._id } }).select('_id').lean();
  if (duplicate) {
    console.error('CCP user sync returned an id already linked to another CRM user', { ccpUserId, userId: String(user._id) });
    return;
  }

  user.ccpUserId = ccpUserId;
  await user.save();
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
  user.otpExpires = Date.now() + OTP_EXPIRY_MS;
  await user.save();

  try {
    const result = await sendLoginOtp(user, otp);
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'OTP email could not be sent' });
  }
};

exports.resendOtp = async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found. Contact admin.' });
  if (!user.isActive) return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });
  if (!user.password) return res.status(400).json({ error: 'Password is not set. Contact admin.' });

  if (user.otp && user.otpExpires && user.otpExpires > Date.now()) {
    const generatedAt = new Date(user.otpExpires).getTime() - OTP_EXPIRY_MS;
    const remainingCooldown = OTP_RESEND_COOLDOWN_MS - (Date.now() - generatedAt);
    if (remainingCooldown > 0) {
      return res.status(429).json({
        error: `Please wait ${Math.ceil(remainingCooldown / 1000)} seconds before resending OTP.`
      });
    }
  }

  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = Date.now() + OTP_EXPIRY_MS;
  await user.save();

  try {
    const result = await sendLoginOtp(user, otp, { resend: true });
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'OTP email could not be sent' });
  }
};

exports.verifyOtp = async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const otp = String(req.body.otp || '').trim();
  if (!email || !otp) {
    console.warn('OTP verify failed', { email, reason: 'missing_email_or_otp', otpLength: otp.length });
    return res.status(400).json({ error: 'Email and OTP are required' });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.isActive) return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });
  if (!user.password) return res.status(400).json({ error: 'Password is not set. Contact admin.' });

  if (!user.otp) {
    console.warn('OTP verify failed', { email, reason: 'no_active_otp', otpLength: otp.length });
    return res.status(400).json({ error: 'No active OTP found. Please resend OTP.' });
  }

  if (String(user.otp) !== otp) {
    console.warn('OTP verify failed', {
      email,
      reason: 'invalid_otp',
      otpLength: otp.length,
      hasStoredOtp: Boolean(user.otp),
      expiresAt: user.otpExpires
    });
    return res.status(400).json({ error: 'Invalid OTP. Please enter the latest 6-digit code from your email.' });
  }

  if (!user.otpExpires || user.otpExpires < Date.now()) {
    console.warn('OTP verify failed', { email, reason: 'expired_otp', expiresAt: user.otpExpires });
    return res.status(400).json({ error: 'OTP expired. Please resend OTP.' });
  }

  // clear otp
  user.otp = undefined;
  user.otpExpires = undefined;
  user.lastLogin = new Date();
  await user.save();

  const token = jwt.sign({ sub: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
  console.info('OTP verified', { email, userId: String(user._id), role: user.role });
  res.json({ ok: true, token, user: publicUser(user) });
};

exports.createUserByAdmin = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '').trim();
  const team = String(req.body.team || 'No team assigned').trim();
  const teamId = String(req.body.teamId || '').trim() || undefined;
  const managerId = String(req.body.managerId || '').trim() || undefined;
  const operationHeadId = String(req.body.operationHeadId || '').trim() || undefined;
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);
  let avatarUrl = '';

  try {
    avatarUrl = readAvatarUrl(req.body.avatarUrl);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!email || !role) return res.status(400).json({ error: 'Email and role required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  let existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'User already exists' });
  const user = new User({ name, email, password: await bcrypt.hash(password, 10), role, team, teamId, managerId, operationHeadId, isActive, avatarUrl, createdBy: req.user?._id });
  await user.save();
  const ccpSync = await syncUserToCcp(user, { action: 'create', password });
  if (ccpSync.ok === false) console.error('CCP user sync failed', ccpSync);
  await saveSyncedCcpUserId(user, ccpSync);
  res.status(201).json({ ok: true, user: publicUser(user), ccpSync });
};

exports.updateUserByAdmin = async (req, res) => {
  const userId = req.params.id;
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const role = String(req.body.role || '').trim();
  const team = String(req.body.team || 'No team assigned').trim();
  const teamId = String(req.body.teamId || '').trim() || undefined;
  const managerId = String(req.body.managerId || '').trim() || undefined;
  const operationHeadId = String(req.body.operationHeadId || '').trim() || undefined;
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
  user.teamId = teamId;
  user.managerId = managerId;
  user.operationHeadId = operationHeadId;
  user.isActive = isActive;
  if (req.body.avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  await user.save();
  const ccpSync = await syncUserToCcp(user, { action: 'update' });
  if (ccpSync.ok === false) console.error('CCP user sync failed', ccpSync);
  await saveSyncedCcpUserId(user, ccpSync);

  res.json({ ok: true, user: publicUser(user), ccpSync });
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

exports.listActiveUsers = async (req, res) => {
  const users = await User.find({ isActive: true })
    .select('ccpUserId source name email avatarUrl role team teamId managerId operationHeadId isActive lastLogin createdAt updatedAt')
    .sort({ name: 1, email: 1 });
  res.json({ ok: true, users });
};

exports.listUsersForCcp = async (req, res) => {
  const users = await User.find({ isActive: true })
    .select('name email avatarUrl role team teamId managerId operationHeadId isActive createdAt updatedAt')
    .sort({ name: 1, email: 1 });

  res.json({
    ok: true,
    users: users.map((user) => ({
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      ccpUserId: user.ccpUserId,
      avatarUrl: user.avatarUrl,
      role: user.role,
      team: user.team,
      teamId: user.teamId,
      managerId: user.managerId,
      operationHeadId: user.operationHeadId,
      isActive: user.isActive,
      source: 'crm',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }))
  });
};

exports.syncUsersToCcp = async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  const results = await syncUsersToCcp(users);
  const synced = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => result.ok === false).length;

  res.json({
    ok: failed === 0,
    total: results.length,
    synced,
    failed,
    results
  });
};

exports.syncUserFromCcp = async (req, res) => {
  const action = String(req.body.action || '').trim().toLowerCase();
  const ccpUserId = String(req.body.ccpUserId || req.body.id || req.body._id || '').trim();
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const role = String(req.body.role || 'operation').trim();
  const team = String(req.body.team || 'No team assigned').trim();
  const teamId = readObjectId(req.body.teamId);
  const managerId = readObjectId(req.body.managerId);
  const operationHeadId = readObjectId(req.body.operationHeadId);
  const avatarUrl = req.body.avatarUrl === undefined || req.body.avatarUrl === null ? '' : String(req.body.avatarUrl);
  const source = String(req.body.source || 'ccp').trim() || 'ccp';
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);
  const password = String(req.body.password || '');

  if (!['create', 'update'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  if (!ccpUserId) return res.status(400).json({ error: 'ccpUserId is required' });
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  let user = await User.findOne({ ccpUserId });
  const userByEmail = await User.findOne({ email });

  if (user && userByEmail && String(user._id) !== String(userByEmail._id)) {
    return res.status(409).json({ error: 'Email already belongs to another CRM user' });
  }

  if (!user) user = userByEmail;

  if (user) {
    user.name = name;
    user.email = email;
    user.role = role;
    user.team = team;
    user.teamId = teamId;
    user.managerId = managerId;
    user.operationHeadId = operationHeadId;
    user.avatarUrl = avatarUrl;
    user.isActive = isActive;
    user.ccpUserId = ccpUserId;
    user.source = source;
    if (!user.password && password) user.password = await bcrypt.hash(password, 10);
    await user.save();
    return res.json({ ok: true, user: publicUser(user) });
  }

  const userData = {
    ccpUserId,
    source,
    name,
    email,
    role,
    team,
    teamId,
    managerId,
    operationHeadId,
    avatarUrl,
    isActive
  };
  if (password) userData.password = await bcrypt.hash(password, 10);

  const createdUser = await User.create(userData);
  return res.status(201).json({ ok: true, user: publicUser(createdUser) });
};

function publicUser(user) {
  return {
    id: user._id,
    ccpUserId: user.ccpUserId,
    source: user.source,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    team: user.team,
    teamId: user.teamId,
    managerId: user.managerId,
    operationHeadId: user.operationHeadId,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
