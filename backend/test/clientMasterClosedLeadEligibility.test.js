const test = require('node:test');
const assert = require('node:assert/strict');
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
