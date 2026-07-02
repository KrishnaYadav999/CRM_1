const express = require('express');
const notificationCtrl = require('../controllers/notificationController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();

function requireCcpSecret(req, res, next) {
  const expectedSecret = process.env.CCP_SHARED_SECRET;
  if (!expectedSecret) return next();

  const providedSecret = req.get('x-ccp-secret') || req.query.secret;
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Invalid CCP secret' });
  }

  return next();
}

router.get('/ccp', requireCcpSecret, notificationCtrl.listNotificationsForCcp);
router.post('/ccp/sync', requireCcpSecret, notificationCtrl.syncNotificationFromCcp);
router.get('/', requireAuth, notificationCtrl.listNotifications);
router.post('/', requireAuth, requireRoles(['admin', 'superadmin', 'manager']), notificationCtrl.createNotification);

module.exports = router;
