const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  eligibleServiceIds,
  isLeadEligibleForClientMaster,
  isLeadServiceEligibleForClientMaster
} = require('../src/services/clientMasterEligibility');

test('open leads are ineligible while previously saved Client Master records stay untouched', () => {
  const lead = { serviceSelections: [{ assignedServiceId: 'legacy-open' }], assignments: [{}] };
  assert.equal(isLeadEligibleForClientMaster(lead), false);
  assert.equal(isLeadServiceEligibleForClientMaster(lead, 'legacy-open'), false);
  assert.deepEqual(eligibleServiceIds(lead), []);
});

test('new open leads are excluded from Client Master', () => {
  const lead = { serviceSelections: [{ assignedServiceId: 'service-open' }], assignments: [{}] };
  assert.equal(isLeadEligibleForClientMaster(lead), false);
  assert.equal(isLeadServiceEligibleForClientMaster(lead, 'service-open'), false);
  assert.deepEqual(eligibleServiceIds(lead), []);
});

test('only closed services on a new lead are eligible', () => {
  const lead = {
    serviceSelections: [{ assignedServiceId: 'service-closed' }, { assignedServiceId: 'service-open' }],
    assignments: [{ closedByText: 'Sales User', closedAt: '2026-09-08T10:00:00.000Z' }, {}]
  };
  assert.equal(isLeadEligibleForClientMaster(lead), true);
  assert.equal(isLeadServiceEligibleForClientMaster(lead, 'service-closed'), true);
  assert.equal(isLeadServiceEligibleForClientMaster(lead, 'service-open'), false);
  assert.deepEqual(eligibleServiceIds(lead), ['service-closed']);
});

test('Client Master search independently filters open leads in the Vercel frontend', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(page, /function isLeadClosedForClientMaster\(lead = \{\}\)/);
  assert.match(page, /if \(item\.clientMasterId\) return true/);
  assert.match(page, /filterClientMasterSearchItems\(response\.data\.items \|\| \[\], leadsResponse\.data\.leads \|\| \[\]\)/);
  assert.match(page, /API_ENDPOINTS\.leads\.list/);
});
