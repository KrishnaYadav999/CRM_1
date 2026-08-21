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

test('restricted client updates accept the form payload but protect the onboarding decision', () => {
  const existing = { cpcbOnboarding: { cpcbPortalRegistered: false, cpcbApplicationStatus: 'In Process' }, compliance: { gstNumber: '' } };
  assert.equal(__test.validateRestrictedCpcbUpdate(existing, { ...existing, basic: { clientLegalName: 'Updated' } }), '');
  assert.equal(__test.validateRestrictedCpcbUpdate(existing, { ...existing, compliance: { gstNumber: 'NEW' } }), '');
  assert.match(__test.validateRestrictedCpcbUpdate(existing, { ...existing, cpcbOnboarding: { cpcbPortalRegistered: true } }), /only be changed/i);
});

test('restricted validation compares the selected service snapshot instead of legacy root CPCB data', () => {
  const client = {
    assignedServiceId: 'service-1',
    data: {
      assignedServiceId: 'service-1',
      cpcbOnboarding: { cpcbPortalRegistered: false, cpcbApplicationStatus: 'Client Submit' },
      cpcb: { loginId: 'legacy-root-login' },
      cpcbDataByAssignedServiceId: {
        'service-1': { cpcb: { loginId: 'selected-service-login' } }
      }
    }
  };
  const resolved = __test.resolveClientMasterData(client, 'service-1');
  assert.equal(__test.validateRestrictedCpcbUpdate(resolved, { ...resolved, basic: { clientLegalName: 'Updated' } }), '');
  assert.equal(__test.validateRestrictedCpcbUpdate(resolved, { ...resolved, cpcb: { loginId: 'changed-login' } }), '');
});

test('restricted saves preserve stored CPCB sections while allowing unlocked data changes', () => {
  const existing = {
    basic: { clientLegalName: 'Old name' },
    cpcb: { loginId: 'stored-login' },
    cpcbDataByAssignedServiceId: { 'service-1': { cpcb: { loginId: 'stored-service-login' } } }
  };
  const safe = __test.preserveRestrictedCpcbSections(existing, {
    basic: { clientLegalName: 'New name' },
    cpcb: { loginId: 'attempted-change' },
    cpcbDataByAssignedServiceId: { 'service-1': { cpcb: { loginId: 'attempted-service-change' } } }
  });
  assert.equal(safe.basic.clientLegalName, 'New name');
  assert.deepEqual(safe.cpcb, existing.cpcb);
  assert.deepEqual(safe.cpcbDataByAssignedServiceId, existing.cpcbDataByAssignedServiceId);
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

test('CPCB No makes the Authorised Person table percentage-neutral whether blank or filled', () => {
  const restricted = { cpcbOnboarding: { cpcbPortalRegistered: false, cpcbApplicationStatus: 'In Process' } };
  const blank = analyzeClientMasterData({ ...restricted, otp: {}, coordinating: {} });
  const filled = analyzeClientMasterData({
    ...restricted,
    otp: {},
    coordinating: {},
    authorised: { name: 'Saved Person', mobile: '9999999999', email: 'saved@example.com' },
    authorisedPersons: [{ name: 'Second Person', designation: 'Manager', mobile: '8888888888' }]
  });
  assert.equal(filled.totalCount, blank.totalCount);
  assert.equal(filled.filledCount, blank.filledCount);
  assert.ok(!filled.filledFields.some((label) => label.startsWith('Authorized Person ')));
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
  assert.match(source, /section !== 'authorised'/);
  assert.match(source, /!cpcbRestricted \? \[\['Authorised Mobile'/);
  assert.doesNotMatch(source, /hasExistingClient && typeof service\.cpcbPortalRegistered !== 'boolean'/);
  assert.match(source, /if \(service\.cpcbPortalRegistered === true\)/);
});
