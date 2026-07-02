const express = require('express');
const router = express.Router();
const teamCtrl = require('../controllers/teamController');
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

router.get('/ccp', requireCcpSecret, teamCtrl.listTeamsForCcp);
router.post('/ccp/sync', requireCcpSecret, teamCtrl.syncTeamFromCcp);
router.get('/', requireAuth, requireRoles(ADMIN_ROLES), teamCtrl.listTeams);
router.post('/', requireAuth, requireRoles(ADMIN_ROLES), teamCtrl.createTeam);

module.exports = router;
