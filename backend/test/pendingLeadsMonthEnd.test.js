const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Lead Open review is gated by India month-end instead of fifteen minutes', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingLeads.jsx'), 'utf8');
  assert.match(page, /function isIndiaMonthEnd\(input = new Date\(\)\)/);
  assert.match(page, /Records become visible on the last day of each month/);
  assert.doesNotMatch(page, /PENDING_AFTER_MS|15 minutes or more|pending for 15 minutes/);
});
