const express = require('express');
const router = express.Router();
const { requireCcpSecret } = require('../middleware/ccpSecret');
const authCtrl = require('../controllers/authController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');


router.post('/request-otp', authCtrl.requestOtp);
router.post('/resend-otp', authCtrl.resendOtp);
router.post('/verify-otp', authCtrl.verifyOtp);
router.post('/forgot-password', authCtrl.forgotPassword);
router.post('/reset-password', authCtrl.resetPassword);
router.get('/ccp/users', requireCcpSecret, authCtrl.listUsersForCcp);
router.post('/ccp/users/sync', requireCcpSecret, authCtrl.syncUserFromCcp);
router.get('/me', requireAuth, authCtrl.me);
router.put('/me', requireAuth, authCtrl.updateMe);
router.put('/me/password', requireAuth, authCtrl.updatePassword);
router.get('/users', requireAuth, authCtrl.listActiveUsers);
router.get('/admin/users', requireAuth, requireRoles(ADMIN_ROLES), authCtrl.listUsers);
router.post('/admin/sync-ccp-users', requireAuth, requireRoles(ADMIN_ROLES), authCtrl.syncUsersToCcp);
router.post('/admin/create-user', requireAuth, requireRoles(ADMIN_ROLES), authCtrl.createUserByAdmin);
router.put('/admin/users/:id', requireAuth, requireRoles(ADMIN_ROLES), authCtrl.updateUserByAdmin);

module.exports = router;
