const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLES } = require('../src/constants/roles');

test('accounts is an allowed CRM user role', () => {
  assert.equal(ROLES.includes('accounts'), true);
});
