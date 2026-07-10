const express = require('express');
const calendarItemCtrl = require('../controllers/calendarItemController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, calendarItemCtrl.listCalendarItems);
router.post('/', requireAuth, calendarItemCtrl.createCalendarItem);
router.put('/:id', requireAuth, calendarItemCtrl.updateCalendarItem);
router.delete('/:id', requireAuth, calendarItemCtrl.deleteCalendarItem);

module.exports = router;
