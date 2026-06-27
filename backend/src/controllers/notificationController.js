const Notification = require('../models/Notification');

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

  const item = await Notification.create({
    title,
    description,
    tag,
    status: String(req.body.status || 'Active').trim() || 'Active',
    kind: 'announcement',
    createdBy: req.user._id,
    createdByName: req.user.name || req.user.email || 'CRM User',
    visibleToRoles: ['operation', 'manager', 'compliance', 'sales', 'admin', 'superadmin'],
    attachmentName: String(req.body.attachmentName || '').trim(),
    attachmentUrl: String(req.body.attachmentUrl || '').trim(),
    pinned: Boolean(req.body.pinned)
  });

  res.status(201).json({ ok: true, notification: mapNotification(item) });
};
