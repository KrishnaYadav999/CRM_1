const express = require('express');
const router = express.Router();
const leadCtrl = require('../controllers/leadController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');
const quotationCtrl = require('../controllers/quotationController');

router.get('/', requireAuth, leadCtrl.listLeads);
router.get('/search/company', requireAuth, leadCtrl.searchCompanies);
router.get('/duplicate-approvals', requireAuth, leadCtrl.listDuplicateLeadApprovals);
router.post('/duplicate-approvals', requireAuth, leadCtrl.requestDuplicateLeadApproval);
router.patch('/duplicate-approvals/:id', requireAuth, leadCtrl.updateDuplicateLeadApproval);
router.post('/bulk', requireAuth, requireRoles(ADMIN_ROLES), leadCtrl.bulkCreateLeads);
router.post('/', requireAuth, leadCtrl.createLead);
router.get('/:id/history', requireAuth, leadCtrl.getLeadHistory);
router.post('/:id/history/email', requireAuth, leadCtrl.recordIntroductionEmail);
router.post('/:id/royalty-claims', requireAuth, leadCtrl.claimLeadRoyalty);
router.get('/:leadId/quotations', requireAuth, quotationCtrl.listLeadQuotations);
router.put('/:id', requireAuth, leadCtrl.updateLead);

module.exports = router;
