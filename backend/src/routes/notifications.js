const express = require('express');
const notificationCtrl = require('../controllers/notificationController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, notificationCtrl.listNotifications);
router.post('/', requireAuth, requireRoles(['admin', 'superadmin', 'manager']), notificationCtrl.createNotification);

module.exports = router;
