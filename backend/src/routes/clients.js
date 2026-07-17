const express = require('express');
const router = express.Router();
const clientCtrl = require('../controllers/clientController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');

router.get('/', requireAuth, clientCtrl.listClients);
router.get('/pending-approvals', requireAuth, clientCtrl.listPendingApprovals);
router.patch('/pending-approvals/clients/approve-all', requireAuth, requireRoles(ADMIN_ROLES), clientCtrl.approveAllPendingClients);
const ccpOwnedWrite = (req, res) => res.status(410).json({ error: 'Client Master records are CCP-owned. Use /api/integrations/ccp/clients; no CRM record was created.' });
router.post('/bulk', requireAuth, ccpOwnedWrite);
router.post('/', requireAuth, ccpOwnedWrite);
router.patch('/:id/approval', requireAuth, requireRoles(ADMIN_ROLES), clientCtrl.updateClientApproval);
router.put('/:id/annual-return', requireAuth, clientCtrl.updateAnnualReturn);
router.put('/:id', requireAuth, ccpOwnedWrite);

module.exports = router;
