const express = require('express');
const router = express.Router();
const leadCtrl = require('../controllers/leadController');
const { requireAuth } = require('../middleware/auth');
const quotationCtrl = require('../controllers/quotationController');

router.get('/', requireAuth, leadCtrl.listLeads);
const ccpOwnedWrite = (req, res) => res.status(410).json({ error: 'Lead records are CCP-owned. Use /api/integrations/ccp/leads; no CRM record was created.' });
router.post('/bulk', requireAuth, ccpOwnedWrite);
router.post('/', requireAuth, ccpOwnedWrite);
router.get('/:id/history', requireAuth, leadCtrl.getLeadHistory);
router.post('/:id/history/email', requireAuth, leadCtrl.recordIntroductionEmail);
router.get('/:leadId/quotations', requireAuth, quotationCtrl.listLeadQuotations);
router.put('/:id', requireAuth, ccpOwnedWrite);

module.exports = router;
