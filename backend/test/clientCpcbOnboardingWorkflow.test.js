const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { __test } = require('../src/controllers/clientController');
const { normalizeClientMaster } = require('../src/services/clientMasterResolver');
const { analyzeClientMasterData } = require('../src/services/userProductivityReport');

test('CPCB onboarding accepts only the supported No-status values and clears status for Yes', () => {
  assert.equal(__test.validateCpcbOnboardingInput(false, 'Fresh Application'), '');
  assert.equal(__test.validateCpcbOnboardingInput(false, 'In Process'), '');
  assert.equal(__test.validateCpcbOnboardingInput(false, 'Client Submit'), '');
  assert.match(__test.validateCpcbOnboardingInput(false, ''), /valid CPCB application status/i);
  assert.equal(__test.validateCpcbOnboardingInput(true, ''), '');
});

test('restricted client updates cannot mutate frozen sections or the onboarding decision', () => {
  const existing = { cpcbOnboarding: { cpcbPortalRegistered: false, cpcbApplicationStatus: 'In Process' }, compliance: { gstNumber: '' } };
  assert.equal(__test.validateRestrictedCpcbUpdate(existing, { ...existing, basic: { clientLegalName: 'Updated' } }), '');
  assert.match(__test.validateRestrictedCpcbUpdate(existing, { ...existing, compliance: { gstNumber: 'NEW' } }), /locked compliance/i);
  assert.match(__test.validateRestrictedCpcbUpdate(existing, { ...existing, cpcbOnboarding: { cpcbPortalRegistered: true } }), /only be changed/i);
});

test('answering Yes preserves every earlier Client Master section on the same data record', () => {
  const existing = {
    companyOverview: { companyName: 'Existing Pvt Ltd', companySummary: 'Keep this' },
    basic: { clientLegalName: 'Existing Pvt Ltd', companyType: 'Private Limited' },
    registeredAddress: { address1: 'Old saved address' },
    compliance: { gstNumber: '27ABCDE1234F1Z5' },
    cpcb: { loginId: 'saved-login' }
  };
  const updated = __test.applyCpcbOnboardingData(existing, {
    registered: true,
    userId: 'user-1',
    changedAt: new Date('2026-08-21T10:00:00.000Z')
  });
  assert.deepEqual(updated.companyOverview, existing.companyOverview);
  assert.deepEqual(updated.basic, existing.basic);
  assert.deepEqual(updated.registeredAddress, existing.registeredAddress);
  assert.deepEqual(updated.compliance, existing.compliance);
  assert.deepEqual(updated.cpcb, existing.cpcb);
  assert.equal(updated.cpcbOnboarding.cpcbPortalRegistered, true);
  assert.equal(updated.cpcbOnboarding.cpcbApplicationStatus, null);
});

test('restricted completion excludes Document, CTE and CPCB sections', () => {
  const base = { companyOverview: {}, basic: {}, registeredAddress: {}, communicationAddress: {}, otp: {}, authorised: {}, coordinating: {} };
  const full = analyzeClientMasterData(base);
  const restricted = analyzeClientMasterData({ ...base, cpcbOnboarding: { cpcbPortalRegistered: false, cpcbApplicationStatus: 'Fresh Application' } });
  assert.ok(restricted.totalCount < full.totalCount);
  const names = restricted.sections.map((section) => section.name);
  assert.equal(names.includes('Documents'), false);
  assert.equal(names.includes('CTE & CTO / CCA'), false);
  assert.equal(names.includes('CPCB Credentials'), false);
  assert.equal(names.includes('CPCB Screenshots'), false);
});

test('service discovery returns service-specific CPCB state', () => {
  const normalized = normalizeClientMaster({
    _id: 'client-1', assignedServiceId: 'service-1',
    data: { cpcbOnboarding: { cpcbPortalRegistered: false, cpcbApplicationStatus: 'Client Submit' } }
  });
  assert.equal(normalized.cpcbPortalRegistered, false);
  assert.equal(normalized.cpcbApplicationStatus, 'Client Submit');
});

test('frontend implements first-time, recheck, locked tabs, badge and immediate persistence', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(source, /Has the Client Registered on CPCB Portal\?/);
  assert.match(source, /Earlier, you selected that this client was not registered/);
  assert.match(source, /cpcbApplicationStatuses = \['Fresh Application', 'In Process', 'Client Submit'\]/);
  assert.match(source, /API_ENDPOINTS\.clients\.cpcbOnboarding/);
  assert.match(source, /This section is locked until CPCB Portal registration is confirmed/);
  assert.match(source, /CPCB Registered/);
  assert.match(source, /CPCB Pending/);
  assert.doesNotMatch(source, /hasExistingClient && typeof service\.cpcbPortalRegistered !== 'boolean'/);
  assert.match(source, /if \(service\.cpcbPortalRegistered === true\)/);
});
