const test = require('node:test');
const assert = require('node:assert/strict');
const { getUserRoles, userHasAnyRole } = require('../src/utils/userRoles');

test('legacy single-role users keep their existing access', () => {
  assert.deepEqual(getUserRoles({ role: 'sales' }), ['sales']);
  assert.equal(userHasAnyRole({ role: 'sales' }, ['sales']), true);
  assert.equal(userHasAnyRole({ role: 'sales' }, ['compliance']), false);
});

test('a Sales and Compliance user receives the combined access of both roles', () => {
  const user = { role: 'sales', roles: ['sales', 'compliance'] };
  assert.deepEqual(getUserRoles(user), ['sales', 'compliance']);
  assert.equal(userHasAnyRole(user, ['sales']), true);
  assert.equal(userHasAnyRole(user, ['compliance']), true);
  assert.equal(userHasAnyRole(user, ['admin']), false);
});

test('compliance-family and duplicate roles are normalized consistently', () => {
  const user = { role: 'Compliance Manager', roles: ['compliance-manager', 'sales', 'sales'] };
  assert.deepEqual(getUserRoles(user), ['compliance-manager', 'sales']);
  assert.equal(userHasAnyRole(user, ['compliance']), true);
});
