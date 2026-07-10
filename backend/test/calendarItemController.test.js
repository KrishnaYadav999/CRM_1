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
