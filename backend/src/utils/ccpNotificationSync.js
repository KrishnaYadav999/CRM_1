const DEFAULT_CCP_NOTIFICATION_SYNC_URL = 'https://ccp-62b2.onrender.com/api/crm/notifications/sync';
const { postJsonToCcp } = require('./ccpSync');

function readSyncUrl() {
  return String(process.env.CCP_NOTIFICATION_SYNC_URL || DEFAULT_CCP_NOTIFICATION_SYNC_URL).trim();
}

function idOf(value) {
  return String(value?._id || value?.id || value || '').trim();
}

function buildNotificationPayload(notification, action) {
  return {
    action,
    crmNotificationId: idOf(notification),
    ccpNotificationId: notification.ccpNotificationId,
    title: notification.title,
    description: notification.description || '',
    tag: notification.tag || 'General',
    status: notification.status || 'Active',
    kind: notification.kind || 'announcement',
    createdByName: notification.createdByName || notification.createdBy?.name || notification.createdBy?.email || 'CRM',
    createdBy: idOf(notification.createdBy),
    audience: (notification.audience || []).map(idOf).filter(Boolean),
    visibleToRoles: notification.visibleToRoles || [],
    attachmentName: notification.attachmentName || '',
    attachmentUrl: notification.attachmentUrl || '',
    pinned: Boolean(notification.pinned),
    metadata: notification.metadata || {},
    source: 'crm',
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt
  };
}

async function syncNotificationToCcp(notification, { action } = {}) {
  return postJsonToCcp(readSyncUrl(), buildNotificationPayload(notification, action), 'CCP notification sync failed');
}

module.exports = { syncNotificationToCcp };
