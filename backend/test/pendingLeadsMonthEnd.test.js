const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Lead Open review retains completed India month-end snapshots', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingLeads.jsx'), 'utf8');
  assert.match(page, /function latestVisibleReviewMonth\(input = new Date\(\)\)/);
  assert.match(page, /function buildMonthEndReviewRows\(leads = \[\], input = new Date\(\)\)/);
  assert.match(page, /Completed monthly snapshots remain available/);
  assert.doesNotMatch(page, /isIndiaMonthEnd\(\) && servicesForMode/);
  assert.doesNotMatch(page, /PENDING_AFTER_MS|15 minutes or more|pending for 15 minutes/);
});
