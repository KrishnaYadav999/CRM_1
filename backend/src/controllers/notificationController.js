const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

const adminRoles = ['admin', 'superadmin'];

function canSeeNotification(user, item) {
  if (!user) return false;
  if ((item.hiddenBy || []).some((id) => String(id) === String(user._id))) return false;
  if (adminRoles.includes(user.role)) return true;
  const userId = String(user._id || '');
  const audience = (item.audience || []).map((id) => String(id));
  const roles = item.visibleToRoles || [];
  return audience.includes(userId) || roles.includes(user.role) || item.kind === 'announcement';
}

function mapNotification(item) {
  return {
    id: item._id,
    _id: item._id,
    crmNotificationId: item.crmNotificationId || String(item._id),
    source: item.source,
    title: item.title,
    description: item.description,
    tag: item.tag,
    status: item.status,
    kind: item.kind,
    createdBy: item.createdByName || item.createdBy?.name || item.createdBy?.email || 'CRM',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    attachmentName: item.attachmentName,
    attachmentUrl: item.attachmentUrl,
    pinned: item.pinned,
    metadata: item.metadata || {}
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

async function emailAnnouncementToAllUsers(item) {
  const users = await User.find({ isActive: { $ne: false }, email: { $ne: '' } }).select('email name').lean();
  const imageUrl = String(item.attachmentUrl || '').trim();
  const published = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(item.createdAt || new Date());
  const image = /^https:\/\//i.test(imageUrl) ? `<tr><td style="padding:0 28px 26px"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.attachmentName || item.title)}" width="564" style="display:block;width:100%;max-width:564px;height:auto;max-height:520px;object-fit:contain;border:1px solid #e4ebe9;border-radius:12px;background:#f8faf9" /></td></tr>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#14213d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#fff;border:1px solid #dfe7e5;border-radius:16px;overflow:hidden"><tr><td style="background:#0f6655;padding:24px 28px;color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:#bde9df;text-transform:uppercase">ANANTTATTVA e-Connect</div><div style="font-size:13px;margin-top:7px;color:#e4f7f2">Official CRM Announcement</div></td></tr><tr><td style="padding:28px 28px 18px"><div style="display:inline-block;background:#fff3e8;color:#c65308;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">${escapeHtml(item.tag || 'General')}</div><h1 style="font-size:26px;line-height:1.25;margin:14px 0 10px;color:#102a25">${escapeHtml(item.title)}</h1><div style="font-size:12px;color:#718096">Published ${escapeHtml(published)} by ${escapeHtml(item.createdByName || 'CRM Team')}</div></td></tr><tr><td style="padding:0 28px 26px"><div style="font-size:15px;line-height:1.75;color:#334155;white-space:pre-wrap">${escapeHtml(item.description)}</div></td></tr>${image}<tr><td style="border-top:1px solid #e7eceb;padding:18px 28px;font-size:11px;line-height:1.5;color:#82908d">This is an official announcement from Ananttattva CRM. Please contact IT Support if you need assistance.</td></tr></table></td></tr></table></body></html>`;
  const results = await Promise.allSettled(users.map((user) => sendMail(user.email, `CRM Announcement: ${item.title}`, html, { branded: false })));
  return {
    recipientCount: users.length,
    emailSent: results.filter((result) => result.status === 'fulfilled').length,
    emailFailed: results.filter((result) => result.status === 'rejected').length
  };
}

async function ensureCrmNotificationId(item) {
  if (!item || item.crmNotificationId) return item;
  item.crmNotificationId = String(item._id || item.id);
  await item.save();
  return item;
}

exports.listNotifications = async (req, res) => {
  const query = adminRoles.includes(req.user.role)
    ? {}
    : {
        $or: [
          { kind: 'announcement' },
          { audience: req.user._id },
          { visibleToRoles: req.user.role }
        ]
      };

  const notifications = await Notification.find(query)
    .populate('createdBy', 'name email')
    .sort({ pinned: -1, createdAt: -1 })
    .limit(200)
    .lean();

  res.json({
    ok: true,
    notifications: notifications
      .filter((item) => canSeeNotification(req.user, item))
      .map(mapNotification)
  });
};

exports.createNotification = async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const tag = String(req.body.tag || 'General').trim();
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });
  const attachmentName = String(req.body.attachmentName || '').trim();
  const attachmentUrl = String(req.body.attachmentUrl || '').trim();

  const item = await Notification.create({
    title,
    description,
    tag,
    status: String(req.body.status || 'Active').trim() || 'Active',
    kind: 'announcement',
    createdBy: req.user._id,
    createdByName: req.user.name || req.user.email || 'CRM User',
    visibleToRoles: ['operation', 'manager', 'compliance', 'sales', 'accounts', 'admin', 'superadmin'],
    attachmentName,
    attachmentUrl,
    pinned: Boolean(req.body.pinned)
  });
  await ensureCrmNotificationId(item);

  try {
    item.metadata = { ...(item.metadata || {}), ...(await emailAnnouncementToAllUsers(item)), emailedAt: new Date() };
  } catch (error) {
    item.metadata = { ...(item.metadata || {}), emailFailed: true, emailError: error.message };
  }
  item.markModified('metadata');
  await item.save();

  res.status(201).json({ ok: true, notification: mapNotification(item) });
};

exports.__test = { emailAnnouncementToAllUsers };

exports.updateNotification = async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });

  const item = await Notification.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Notification not found' });

  Object.assign(item, {
    title,
    description,
    tag: String(req.body.tag || 'General').trim() || 'General',
    status: String(req.body.status || 'Active').trim() || 'Active',
    attachmentName: String(req.body.attachmentName || '').trim(),
    attachmentUrl: String(req.body.attachmentUrl || '').trim(),
    pinned: Boolean(req.body.pinned)
  });
  await item.save();

  return res.json({ ok: true, notification: mapNotification(item) });
};

exports.clearNotification = async (req, res) => {
  const item = await Notification.findById(req.params.id);
  if (!item || !canSeeNotification(req.user, item)) return res.status(404).json({ error: 'Notification not found' });
  await Notification.findByIdAndUpdate(item._id, { $addToSet: { hiddenBy: req.user._id } });
  return res.json({ ok: true, id: item._id });
};
