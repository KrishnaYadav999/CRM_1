const express = require('express');
const router = express.Router();
const quotationCtrl = require('../controllers/quotationController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');

router.get('/', requireAuth, quotationCtrl.listQuotations);
router.patch('/pending-approvals/approve-all', requireAuth, requireRoles(ADMIN_ROLES), quotationCtrl.approveAllPendingQuotations);
router.post('/', requireAuth, quotationCtrl.createQuotation);
router.patch('/:id/approval', requireAuth, requireRoles(ADMIN_ROLES), quotationCtrl.updateQuotationApproval);
router.put('/:id', requireAuth, quotationCtrl.updateQuotation);

module.exports = router;
