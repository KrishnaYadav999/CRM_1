const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

const adminRoles = ['admin', 'superadmin'];

function canSeeNotification(user, item) {
  if (!user) return false;
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
  const html = `<h1 style="font-size:24px;margin:0 0 16px">${escapeHtml(item.title)}</h1><p style="font-size:15px;line-height:1.7;white-space:pre-wrap">${escapeHtml(item.description)}</p>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.attachmentName || item.title)}" style="display:block;max-width:100%;height:auto;margin:22px auto 0;border-radius:14px" />` : ''}`;
  const results = await Promise.allSettled(users.map((user) => sendMail(user.email, `CRM Announcement: ${item.title}`, html)));
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
  if (!attachmentName || !attachmentUrl || !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachmentName)) {
    return res.status(400).json({ error: 'Announcement image is required' });
  }

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
