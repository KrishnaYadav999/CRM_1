const express = require('express');
const router = express.Router();
const annualReturnCtrl = require('../controllers/annualReturnController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, annualReturnCtrl.listAnnualReturns);

module.exports = router;
