const express = require('express');
const router = express.Router();
const clientCtrl = require('../controllers/clientController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES, CLIENT_APPROVAL_ROLES } = require('../constants/roles');

router.get('/', requireAuth, clientCtrl.listClients);
router.get('/pending-approvals', requireAuth, clientCtrl.listPendingApprovals);
router.patch('/pending-approvals/clients/approve-all', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), clientCtrl.approveAllPendingClients);
router.post('/bulk', requireAuth, requireRoles(ADMIN_ROLES), clientCtrl.bulkCreateClients);
router.post('/years/bulk', requireAuth, requireRoles(ADMIN_ROLES), clientCtrl.bulkUpdateClientYears);
router.post('/', requireAuth, clientCtrl.createClient);
router.patch('/:id/approval', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), clientCtrl.updateClientApproval);
router.put('/:id/annual-return', requireAuth, clientCtrl.updateAnnualReturn);
router.put('/:id', requireAuth, clientCtrl.updateClient);

module.exports = router;
