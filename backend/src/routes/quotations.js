const express = require('express');
const router = express.Router();
const quotationCtrl = require('../controllers/quotationController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');

router.get('/', requireAuth, quotationCtrl.listQuotations);
router.get('/service-categories', requireAuth, quotationCtrl.listServiceCategories);
router.post('/service-categories', requireAuth, quotationCtrl.createServiceCategory);
router.get('/pibo-categories', requireAuth, quotationCtrl.listPiboCategories);
router.post('/pibo-categories', requireAuth, quotationCtrl.createPiboCategory);
router.patch('/pending-approvals/approve-all', requireAuth, requireRoles(ADMIN_ROLES), quotationCtrl.approveAllPendingQuotations);
router.post('/sync-ccp', requireAuth, requireRoles(ADMIN_ROLES), quotationCtrl.syncCcpQuotations);
router.post('/', requireAuth, quotationCtrl.createQuotation);
router.get('/:id', requireAuth, quotationCtrl.getQuotation);
router.patch('/:id/approval', requireAuth, requireRoles(ADMIN_ROLES), quotationCtrl.updateQuotationApproval);
router.put('/:id', requireAuth, quotationCtrl.updateQuotation);

module.exports = router;
