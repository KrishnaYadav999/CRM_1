const test = require('node:test');
const assert = require('node:assert/strict');
const { getVisibleUserScope, getLeadVisibleUserScope, ownerFilter } = require('../src/utils/visibilityScope');

test('every authenticated CRM user can read the shared lead and client catalog', async () => {
  const scope = await getVisibleUserScope({ _id: 'new-user-id', role: 'operation', email: 'new.user@example.com' });
  assert.equal(scope, null);
  assert.deepEqual(ownerFilter(scope), {});
});

test('an unauthenticated identity never receives a readable catalog scope', async () => {
  const scope = await getVisibleUserScope(null);
  assert.deepEqual(scope, { ids: [], identities: [] });
  assert.deepEqual(ownerFilter(scope), { _id: { $exists: false } });
});

test('admins receive the full lead catalog while unauthenticated users receive none', async () => {
  assert.equal(await getLeadVisibleUserScope({ _id: 'admin-id', role: 'admin' }), null);
  assert.deepEqual(await getLeadVisibleUserScope(null), { ids: [], identities: [] });
});

test('lead assignment filter does not include records merely created by the user', () => {
  const filter = ownerFilter({ ids: ['staff-id'], identities: ['staff@example.com'] }, 'assignedTo', 'assignedTo', [
    'assignments.assignedStaff', 'assignments.assignedStaffEmail'
  ]);
  assert.equal(JSON.stringify(filter).includes('createdBy'), false);
  assert.equal(JSON.stringify(filter).includes('assignments.assignedStaff'), true);
});
