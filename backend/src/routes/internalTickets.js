const router = require('express').Router();
const controller = require('../controllers/internalTicketController');
const { requireAuth } = require('../middleware/auth');
router.get('/', requireAuth, controller.list);
router.post('/', requireAuth, controller.create);
router.get('/:id', requireAuth, controller.detail);
router.patch('/:id/call', requireAuth, controller.call);
router.put('/:id', requireAuth, controller.update);
module.exports = router;
