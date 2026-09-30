const express = require('express');
const controller = require('../controllers/dashboardInsightsController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.get('/purchase-orders', requireAuth, controller.purchaseOrders);
router.get('/purchase-sales', requireAuth, controller.purchaseSales);

module.exports = router;
