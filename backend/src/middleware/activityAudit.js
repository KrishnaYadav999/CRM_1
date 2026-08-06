const AuditLog = require('../models/AuditLog');
const UserSession = require('../models/UserSession');

const SKIP_PATHS = new Set(['/api/auth/me', '/api/auth/admin/logs', '/api/auth/admin/logs/summary']);
const MODULE_LABELS = {
  auth: 'Authentication', leads: 'Lead Generation', clients: 'Client Master',
  quotations: 'Quotation', 'proforma-invoices': 'Proforma Invoice',
  'annual-returns': 'Annual Returns', notifications: 'Notifications', teams: 'Teams',
  'calendar-items': 'Calendar', 'support-tickets': 'Support Tickets', assets: 'Assets'
};

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

function describe(method, moduleName, path) {
  const verb = { POST: 'Created or submitted', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted', GET: 'Viewed' }[method] || method;
  return `${verb} ${moduleName}${path.includes('/approval') ? ' approval' : ''}`;
}

function activityAudit(req, res, next) {
  if (!req.user) return next();
  const sessionId = String(req.authSessionId || '');
  UserSession.updateOne(
    { sessionId, userId: req.user._id },
    { $set: { lastActivityAt: new Date() }, $inc: { activityCount: 1 } }
  ).catch(() => {});

  res.on('finish', () => {
    if (res.statusCode >= 400 || SKIP_PATHS.has(req.originalUrl.split('?')[0])) return;
    const method = String(req.method || '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    const segment = req.originalUrl.split('?')[0].split('/').filter(Boolean)[1] || 'crm';
    const moduleName = MODULE_LABELS[segment] || segment.replace(/-/g, ' ');
    AuditLog.create({
      userId: req.user._id, sessionId, action: method, module: moduleName,
      method, path: req.originalUrl.split('?')[0], statusCode: res.statusCode,
      description: describe(method, moduleName, req.originalUrl), ipAddress: clientIp(req)
    }).catch(() => {});
  });
  next();
}

module.exports = { activityAudit, clientIp };
