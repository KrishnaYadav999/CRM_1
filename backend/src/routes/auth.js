const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');

function requireCcpSecret(req, res, next) {
  const expectedSecret = process.env.CCP_SHARED_SECRET;
  if (!expectedSecret) return next();

  const providedSecret = req.get('x-ccp-secret') || req.query.secret;
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Invalid CCP secret' });
  }

  return next();
}

router.post('/request-otp', authCtrl.requestOtp);
router.post('/verify-otp', authCtrl.verifyOtp);
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
