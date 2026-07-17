const express = require('express');
const router = express.Router();
const teamCtrl = require('../controllers/teamController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');
const { requireCcpSecret } = require('../middleware/ccpSecret');


router.get('/ccp', requireCcpSecret, teamCtrl.listTeamsForCcp);
router.post('/ccp/sync', requireCcpSecret, teamCtrl.syncTeamFromCcp);
router.get('/', requireAuth, requireRoles(ADMIN_ROLES), teamCtrl.listTeams);
router.post('/', requireAuth, requireRoles(ADMIN_ROLES), teamCtrl.createTeam);

module.exports = router;
