const test = require('node:test');
const assert = require('node:assert/strict');
const { getVisibleUserScope, ownerFilter } = require('../src/utils/visibilityScope');

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
