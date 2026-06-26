const express = require('express');
const router = express.Router();
const leadCtrl = require('../controllers/leadController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, leadCtrl.listLeads);
router.post('/bulk', requireAuth, leadCtrl.bulkCreateLeads);
router.post('/', requireAuth, leadCtrl.createLead);
router.put('/:id', requireAuth, leadCtrl.updateLead);

module.exports = router;
