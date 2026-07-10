const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLES } = require('../src/constants/roles');
const { __test } = require('../src/utils/ccpUserSync');

test('accounts is an allowed CRM user role', () => {
  assert.equal(ROLES.includes('accounts'), true);
});

test('CCP user sync preserves accounts role exactly', () => {
  const payload = __test.buildUserPayload({
    _id: 'crm-user-1',
    name: 'Accounts User',
    email: 'accounts@example.com',
    role: 'accounts',
    team: 'Accounts',
    isActive: true
  }, 'update');

  assert.equal(payload.role, 'accounts');
  assert.equal(payload.team, 'Accounts');
});
