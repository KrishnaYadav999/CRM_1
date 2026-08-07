const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/controllers/leadController');

test('lead code sequence supports legacy and current ATPL formats', () => {
  assert.equal(_test.leadCodeSequence('ATPL-0001'), 1);
  assert.equal(_test.leadCodeSequence('ATPL-LEAD-0387'), 387);
  assert.equal(_test.leadCodeSequence('not-a-code'), 0);
});
