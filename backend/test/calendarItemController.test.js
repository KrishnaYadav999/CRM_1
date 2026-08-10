const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/controllers/calendarItemController');

test('calendar item payload preserves client, assignment, and history fields', () => {
  const result = __test.buildItemData({
    id: 'todo-1',
    title: ' Follow up with client ',
    clientKey: 'client-1',
    clientNumber: 'ATPL-1',
    clientName: 'Acme',
    assignedTo: 'accounts@example.com',
    assignedToName: 'Accounts User',
    updateReason: 'Client asked for a schedule update',
    scheduledDate: '2026-07-10',
    scheduledTime: '10:30',
    type: 'follow-up',
    history: [{ fromDate: '2026-07-09', toDate: '2026-07-10' }]
  }, { name: 'Admin User' });

  assert.equal(result.externalId, 'todo-1');
  assert.equal(result.title, 'Follow up with client');
  assert.equal(result.clientKey, 'client-1');
  assert.equal(result.clientNumber, 'ATPL-1');
  assert.equal(result.assignedTo, 'accounts@example.com');
  assert.equal(result.assignedToName, 'Accounts User');
  assert.equal(result.updateReason, 'Client asked for a schedule update');
  assert.equal(result.type, 'follow-up');
  assert.equal(result.createdBy, 'Admin User');
  assert.deepEqual(result.history, [{ fromDate: '2026-07-09', toDate: '2026-07-10' }]);
});

test('calendar completion clears the matching service follow-up and records it once', () => {
  const lead = { serviceSelections: [{ nextFollowUpDate: '2026-08-12', nextFollowUpTime: '11:00', followUpRemarks: 'Call client', followUpHistory: [] }] };
  const item = { _id: 'calendar-1', type: 'followup', status: 'completed', scheduledDate: '2026-08-12', scheduledTime: '11:00', completionRemarks: 'Spoke to client', completedAt: '2026-08-10T10:00:00.000Z', metadata: { serviceIndex: 0 } };

  assert.equal(__test.applyCalendarFollowUpClosure(lead, item, { name: 'Admin' }), true);
  assert.equal(lead.serviceSelections[0].nextFollowUpDate, '');
  assert.equal(lead.serviceSelections[0].followUpRemarks, '');
  assert.equal(lead.serviceSelections[0].followUpHistory[0].calendarItemId, 'calendar-1');
  assert.equal(lead.serviceSelections[0].followUpHistory[0].status, 'closed');
  assert.equal(__test.applyCalendarFollowUpClosure(lead, item, { name: 'Admin' }), false);
  assert.equal(lead.serviceSelections[0].followUpHistory.length, 1);
});

test('an older calendar completion does not clear a newer current follow-up', () => {
  const lead = { serviceSelections: [{ nextFollowUpDate: '2026-08-20', nextFollowUpTime: '15:00', followUpRemarks: 'New follow-up', followUpHistory: [] }] };
  const item = { externalId: 'followup-old', type: 'follow-up', status: 'completed', scheduledDate: '2026-08-12', scheduledTime: '11:00', metadata: { serviceIndex: 0 } };

  assert.equal(__test.applyCalendarFollowUpClosure(lead, item, { email: 'user@example.com' }), true);
  assert.equal(lead.serviceSelections[0].nextFollowUpDate, '2026-08-20');
  assert.equal(lead.serviceSelections[0].followUpRemarks, 'New follow-up');
  assert.equal(lead.serviceSelections[0].followUpHistory[0].scheduledDate, '2026-08-12');
});

test('calendar completion can find a service by schedule when old items have no service index', () => {
  const services = [
    { nextFollowUpDate: '2026-08-11', nextFollowUpTime: '10:00' },
    { nextFollowUpDate: '2026-08-12', nextFollowUpTime: '11:00' }
  ];
  assert.equal(__test.resolveServiceIndex(services, { scheduledDate: '2026-08-12', scheduledTime: '11:00' }), 1);
});
