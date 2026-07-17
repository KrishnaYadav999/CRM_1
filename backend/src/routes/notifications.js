const express = require('express');
const notificationCtrl = require('../controllers/notificationController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { requireCcpSecret } = require('../middleware/ccpSecret');

const router = express.Router();


router.get('/ccp', requireCcpSecret, notificationCtrl.listNotificationsForCcp);
router.post('/ccp/sync', requireCcpSecret, notificationCtrl.syncNotificationFromCcp);
router.get('/', requireAuth, notificationCtrl.listNotifications);
router.post('/', requireAuth, requireRoles(['admin', 'superadmin', 'manager']), notificationCtrl.createNotification);
router.put('/:id', requireAuth, requireRoles(['admin', 'superadmin', 'manager']), notificationCtrl.updateNotification);

module.exports = router;
