const express = require('express');
const router = express.Router();
const clientCtrl = require('../controllers/clientController');
const reviewCtrl = require('../controllers/clientComplianceReviewController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES, CLIENT_APPROVAL_ROLES } = require('../constants/roles');

router.get('/', requireAuth, clientCtrl.listClients);
router.get('/pending-approvals', requireAuth, clientCtrl.listPendingApprovals);
router.patch('/pending-approvals/clients/approve-all', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), clientCtrl.approveAllPendingClients);
router.post('/bulk', requireAuth, requireRoles(ADMIN_ROLES), clientCtrl.bulkCreateClients);
router.post('/years/bulk', requireAuth, requireRoles(ADMIN_ROLES), clientCtrl.bulkUpdateClientYears);
router.post('/', requireAuth, clientCtrl.createClient);
router.get('/:id', requireAuth, clientCtrl.getClient);
router.get('/:id/compliance-review', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), reviewCtrl.getReview);
router.put('/:id/compliance-review/sections/:sectionKey', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), reviewCtrl.updateSection);
router.post('/:id/compliance-review/decision', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), reviewCtrl.completeReview);
router.patch('/:id/approval', requireAuth, requireRoles(CLIENT_APPROVAL_ROLES), clientCtrl.updateClientApproval);
router.put('/:id/annual-return', requireAuth, clientCtrl.updateAnnualReturn);
router.put('/:id', requireAuth, clientCtrl.updateClient);

module.exports = router;
