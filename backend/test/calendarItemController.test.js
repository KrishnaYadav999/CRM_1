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

test('calendar completion clears matching service and legacy lead follow-up fields and records it once', () => {
  const lead = { nextFollowUpDate: '2026-08-12', nextFollowUpTime: '11:00', followUpRemarks: 'Legacy call client', serviceSelections: [{ nextFollowUpDate: '2026-08-12', nextFollowUpTime: '11:00', followUpRemarks: 'Call client', followUpHistory: [] }] };
  const item = { _id: 'calendar-1', type: 'followup', status: 'completed', scheduledDate: '2026-08-12', scheduledTime: '11:00', completionRemarks: 'Spoke to client', completedAt: '2026-08-10T10:00:00.000Z', metadata: { serviceIndex: 0 } };

  assert.equal(__test.applyCalendarFollowUpClosure(lead, item, { name: 'Admin' }), true);
  assert.equal(lead.serviceSelections[0].nextFollowUpDate, '');
  assert.equal(lead.serviceSelections[0].followUpRemarks, '');
  assert.equal(lead.nextFollowUpDate, '');
  assert.equal(lead.nextFollowUpTime, '');
  assert.equal(lead.followUpRemarks, '');
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

test('calendar completion ignores a stale numeric index and finds the current follow-up schedule', () => {
  const services = [
    { assignedServiceId: 'service-brand', nextFollowUpDate: '2026-08-20', nextFollowUpTime: '15:00' },
    { assignedServiceId: 'service-importer', nextFollowUpDate: '2026-08-14', nextFollowUpTime: '03:00' }
  ];
  const item = { scheduledDate: '2026-08-14', scheduledTime: '03:00', metadata: { serviceIndex: 0 } };
  assert.equal(__test.resolveServiceIndex(services, item), 1);
});

test('stable assigned service id wins when service rows are reordered', () => {
  const services = [
    { assignedServiceId: 'service-brand', nextFollowUpDate: '2026-08-14' },
    { assignedServiceId: 'service-importer', nextFollowUpDate: '2026-08-14' }
  ];
  const item = { scheduledDate: '2026-08-14', metadata: { serviceIndex: 0, assignedServiceId: 'service-importer' } };
  assert.equal(__test.resolveServiceIndex(services, item), 1);
});

test('regular users can only access calendar items they created or are assigned', () => {
  const user = { _id: '507f1f77bcf86cd799439011', email: 'one@example.com', name: 'User One', role: 'user' };
  assert.equal(__test.canAccessCalendarItem({ createdByUser: user._id }, user), true);
  assert.equal(__test.canAccessCalendarItem({ assignedToEmail: 'one@example.com' }, user), true);
  assert.equal(__test.canAccessCalendarItem({ createdBy: 'User Two', assignedToEmail: 'two@example.com' }, user), false);
  const filter = __test.calendarVisibilityFilter(user);
  assert.ok(Array.isArray(filter.$or));
  assert.ok(filter.$or.length > 0);
});

test('admins retain access to all calendar items', () => {
  const admin = { role: 'admin', email: 'admin@example.com' };
  assert.deepEqual(__test.calendarVisibilityFilter(admin), {});
  assert.equal(__test.canAccessCalendarItem({ assignedToEmail: 'other@example.com' }, admin), true);
});
