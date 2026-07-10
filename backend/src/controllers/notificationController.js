const Notification = require('../models/Notification');
const User = require('../models/User');
const mongoose = require('mongoose');
const { syncNotificationToCcp } = require('../utils/ccpNotificationSync');

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
    ccpNotificationId: item.ccpNotificationId,
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

function readCcpNotificationIdFromSync(syncResult) {
  const payload = syncResult?.response || {};
  return String(
    payload.ccpNotificationId
    || payload.notification?.ccpNotificationId
    || payload.notification?.id
    || payload.notification?._id
    || payload.data?.ccpNotificationId
    || payload.data?.id
    || payload.data?._id
    || ''
  ).trim();
}

async function ensureCrmNotificationId(item) {
  if (!item || item.crmNotificationId) return item;
  item.crmNotificationId = String(item._id || item.id);
  await item.save();
  return item;
}

async function saveSyncedCcpNotificationId(item, syncResult) {
  if (!item || syncResult?.ok === false) return;

  const ccpNotificationId = readCcpNotificationIdFromSync(syncResult);
  if (!ccpNotificationId || String(item.ccpNotificationId || '') === ccpNotificationId) return;

  const duplicate = await Notification.findOne({ ccpNotificationId, _id: { $ne: item._id } }).select('_id').lean();
  if (duplicate) {
    console.error('CCP notification sync returned an id already linked to another CRM notification', {
      ccpNotificationId,
      notificationId: String(item._id)
    });
    return;
  }

  item.ccpNotificationId = ccpNotificationId;
  await item.save();
}

async function resolveCcpUserId(value) {
  const id = String(value || '').trim();
  if (!id) return undefined;

  const byCcpId = await User.findOne({ ccpUserId: id }).select('_id').lean();
  if (byCcpId) return byCcpId._id;

  if (mongoose.Types.ObjectId.isValid(id)) {
    const byId = await User.findById(id).select('_id').lean();
    if (byId) return byId._id;
  }

  return undefined;
}

async function resolveCcpUserIds(values) {
  const ids = [];
  for (const value of Array.isArray(values) ? values : []) {
    const resolvedId = await resolveCcpUserId(value);
    if (resolvedId) ids.push(String(resolvedId));
  }
  return [...new Set(ids)];
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
    visibleToRoles: ['operation', 'manager', 'compliance', 'sales', 'accounts', 'admin', 'superadmin'],
    attachmentName: String(req.body.attachmentName || '').trim(),
    attachmentUrl: String(req.body.attachmentUrl || '').trim(),
    pinned: Boolean(req.body.pinned)
  });
  await ensureCrmNotificationId(item);
  const ccpSync = await syncNotificationToCcp(item, { action: 'create' });
  if (ccpSync.ok === false) console.error('CCP notification sync failed', ccpSync);
  await saveSyncedCcpNotificationId(item, ccpSync);

  res.status(201).json({ ok: true, notification: mapNotification(item), ccpSync });
};

exports.listNotificationsForCcp = async (req, res) => {
  const notifications = await Notification.find()
    .populate('createdBy', 'crmUserId ccpUserId name email')
    .sort({ pinned: -1, createdAt: -1 })
    .limit(500)
    .lean();

  res.json({ ok: true, notifications: notifications.map(mapNotification) });
};

exports.syncNotificationFromCcp = async (req, res) => {
  const action = String(req.body.action || '').trim().toLowerCase();
  const ccpNotificationId = String(req.body.ccpNotificationId || req.body.id || req.body._id || '').trim();
  const crmNotificationId = String(req.body.crmNotificationId || '').trim();
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const source = String(req.body.source || 'ccp').trim() || 'ccp';

  if (!['create', 'update'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!ccpNotificationId) return res.status(400).json({ error: 'ccpNotificationId is required' });
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });

  const audience = await resolveCcpUserIds(req.body.audience);
  let item = await Notification.findOne({ ccpNotificationId });

  const data = {
    title,
    description,
    tag: String(req.body.tag || 'General').trim() || 'General',
    status: String(req.body.status || 'Active').trim() || 'Active',
    kind: String(req.body.kind || 'announcement').trim() || 'announcement',
    createdByName: String(req.body.createdByName || 'CCP').trim() || 'CCP',
    audience,
    visibleToRoles: Array.isArray(req.body.visibleToRoles) ? req.body.visibleToRoles.map((role) => String(role || '').trim()).filter(Boolean) : [],
    attachmentName: String(req.body.attachmentName || '').trim(),
    attachmentUrl: String(req.body.attachmentUrl || '').trim(),
    pinned: Boolean(req.body.pinned),
    metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
    ccpNotificationId,
    source
  };

  if (item) {
    Object.assign(item, data);
    item.crmNotificationId = item.crmNotificationId || crmNotificationId || String(item._id);
    await item.save();
    return res.json({ ok: true, crmNotificationId: item.crmNotificationId || String(item._id), notification: mapNotification(item) });
  }

  item = await Notification.create({
    ...data,
    crmNotificationId: crmNotificationId || undefined
  });
  await ensureCrmNotificationId(item);

  return res.status(201).json({ ok: true, crmNotificationId: item.crmNotificationId || String(item._id), notification: mapNotification(item) });
};
