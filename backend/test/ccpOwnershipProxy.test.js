const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const proxy = require('../src/routes/ccpIntegrations');

const { sanitizeLead, sanitizeClient, normalizeCompanyIdentity, leadOwnerName } = proxy._test;
const user = { _id: '64b000000000000000000001', name: 'CRM User', email: 'User@Example.com', role: 'sales' };

test('lead payload is whitelisted and creator identity is server-owned', () => {
  const payload = sanitizeLead({ company: 'Acme', workflowStatus: 'submitted', createdByEmail: 'spoof@example.com', unexpected: true }, user);
  assert.equal(payload.company, 'Acme');
  assert.equal(payload.createdByEmail, 'user@example.com');
  assert.equal(payload.createdByCrmUserId, String(user._id));
  assert.equal(payload.unexpected, undefined);
});

test('lead follow-up history is preserved through the CCP proxy', () => {
  const history = [{ id: 'previous-1', scheduledDate: '2026-07-30', remarks: 'Called client', status: 'superseded' }];
  const payload = sanitizeLead({ company: 'Acme', followUpHistory: history }, user);
  assert.deepEqual(payload.followUpHistory, history);
});

test('duplicate company identity is case, punctuation, and legal-suffix safe', () => {
  assert.equal(
    normalizeCompanyIdentity('20 Microns Nano Minerals Limited'),
    normalizeCompanyIdentity('  20 MICRONS NANO MINERALS LTD. ')
  );
  assert.equal(normalizeCompanyIdentity('A & B Private Limited'), normalizeCompanyIdentity('A and B Pvt Ltd'));
});

test('duplicate warning resolves the human owner name', () => {
  assert.equal(leadOwnerName({ createdBy: { name: 'Sales User' } }), 'Sales User');
  assert.equal(leadOwnerName({ importedCreatedBy: 'Imported Owner' }), 'Imported Owner');
});

test('CRM ids are not forwarded as CCP assignedTo ids', () => {
  const payload = sanitizeLead({ assignedTo: 'crm-user-id', assignedToCrmUserId: 'crm-user-id', assignedToEmail: 'staff@example.com' }, user);
  assert.equal(payload.assignedTo, undefined);
  assert.equal(payload.assignedToCrmUserId, 'crm-user-id');
});

test('blank closedBy is not forwarded as a CCP ObjectId', () => {
  const payload = sanitizeLead({ company: 'Acme', closedBy: '', closedByText: 'CRM User', closedByEmail: 'closer@example.com' }, user);
  assert.equal(payload.closedBy, undefined);
  assert.equal(payload.closedByText, 'CRM User');
  assert.equal(payload.closedByEmail, 'closer@example.com');
});

test('lead detail fields and assignment rows are forwarded to CCP', () => {
  const payload = sanitizeLead({
    communicationMode: 'Referral',
    communicationModeNote: 'Referred by existing client',
    firstAnnualReturnYearApplicable: '2025-26',
    serviceSelections: [{ applicantType: 'PIBO', firstAnnualReturnYearApplicable: '2025-26', ignored: true }],
    assignments: [{
      assignedTo: 'manager-crm-id',
      assignedToText: 'Manager One',
      closedBy: 'closer-crm-id',
      closedByText: 'Closer One',
      assignedStaff: 'staff-crm-id',
      assignedStaffText: 'Staff One',
      ignored: true
    }]
  }, user);
  assert.equal(payload.communicationModeNote, 'Referred by existing client');
  assert.equal(payload.firstAnnualReturnYearApplicable, '2025-26');
  assert.equal(payload.serviceSelections[0].firstAnnualReturnYearApplicable, '2025-26');
  assert.deepEqual(payload.assignments[0], {
    assignedTo: 'manager-crm-id',
    assignedToText: 'Manager One',
    closedBy: 'closer-crm-id',
    closedByText: 'Closer One',
    assignedStaff: 'staff-crm-id',
    assignedStaffText: 'Staff One'
  });
});

test('different staff members remain assigned to their individual assignment rows', () => {
  const payload = sanitizeLead({
    assignments: [
      { assignedTo: user._id, assignedStaff: '64b000000000000000000011', assignedStaffText: 'Shubham' },
      { assignedTo: user._id, assignedStaff: '64b000000000000000000012', assignedStaffText: 'Sonal' },
      { assignedTo: user._id, assignedStaff: '64b000000000000000000013', assignedStaffText: 'Prachi' }
    ]
  }, { ...user, role: 'manager' }, { isUpdate: true });

  assert.deepEqual(
    payload.assignments.map((row) => [row.assignedStaff, row.assignedStaffText]),
    [
      ['64b000000000000000000011', 'Shubham'],
      ['64b000000000000000000012', 'Sonal'],
      ['64b000000000000000000013', 'Prachi']
    ]
  );
});

test('submit lead only does not create complianceHealthReport', () => {
  const payload = sanitizeLead({ company: 'Acme', workflowStatus: 'submitted' }, user);
  assert.equal(payload.workflowStatus, 'submitted');
  assert.equal(payload.complianceHealthReport, undefined);
});

test('submit with complianceHealthReport forwards it to CCP lead only', () => {
  const report = { yearOfCommencement: '2024', reviewedConfirmation: true, keyObservations: ['ok'] };
  const payload = sanitizeLead({ company: 'Acme', workflowStatus: 'submitted', complianceHealthReport: report }, user);
  assert.equal(payload.workflowStatus, 'submitted');
  assert.deepEqual(payload.complianceHealthReport, report);
});

test('lead update does not send CRM user names as CCP updatedBy ObjectIds', () => {
  const payload = sanitizeLead({ company: 'Acme', updatedBy: 'CRM User' }, user, { isUpdate: true });
  assert.equal(payload.updatedBy, undefined);
  assert.equal(payload.updatedByText, 'CRM User');
  assert.equal(payload.updatedByEmail, 'user@example.com');
  assert.equal(payload.updatedByCrmUserId, String(user._id));
});

test('client payload remains nested and non-admin cannot spoof approval', () => {
  const payload = sanitizeClient({ selectedLead: '64b000000000000000000099', workflowStatus: 'submitted', adminControls: { approvalStatus: 'APPROVED' }, data: { basic: { clientLegalName: 'Acme', evil: true }, registeredAddress: { address1: 'One' }, cpcb: { linkedToCommonPortal: 'Yes', status: 'Approved', unitId: 'UNIT-42', evil: true } } }, user, false);
  assert.equal(payload.data.basic.clientLegalName, 'Acme');
  assert.equal(payload.data.basic.evil, undefined);
  assert.deepEqual(payload.data.cpcb, { linkedToCommonPortal: 'Yes', status: 'Approved', unitId: 'UNIT-42' });
  assert.equal(payload.adminControls.approvalStatus, 'PENDING');
  assert.equal(payload.createdByEmail, 'user@example.com');
});

test('client payload forwards named process diagram PDFs to CCP', () => {
  const payload = sanitizeClient({
    data: {
      processDiagrams: [
        { id: 'pfd-1', name: 'Process Flow Diagram', file: { url: 'https://cdn.example.com/pfd.pdf' }, ignored: true }
      ]
    }
  }, user, true);
  assert.deepEqual(payload.data.processDiagrams, [
    { id: 'pfd-1', name: 'Process Flow Diagram', file: { url: 'https://cdn.example.com/pfd.pdf' } }
  ]);
});

test('client payload forwards named CPCB screenshots to CCP', () => {
  const payload = sanitizeClient({
    data: {
      cpcbScreenshots: [
        { id: 'shot-1', name: 'CPCB dashboard screenshot', file: { secureUrl: 'https://cdn.example.com/cpcb.png' }, ignored: true }
      ]
    }
  }, user, true);
  assert.deepEqual(payload.data.cpcbScreenshots, [
    { id: 'shot-1', name: 'CPCB dashboard screenshot', file: { secureUrl: 'https://cdn.example.com/cpcb.png' } }
  ]);
});

test('frontend never contains the CCP shared API key', () => {
  const frontend = path.join(__dirname, '../../frontend/src');
  const files = [];
  function walk(dir) { fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : files.push(path.join(dir, entry.name))); }
  walk(frontend);
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /CCP_SHARED_API_KEY|x-ccp-api-key/i);
});

test('CCP lead visibility includes a user who contributed a service', () => {
  const { filterByScope } = require('../src/routes/ccp')._test;
  const lead = {
    importedCreatedBy: 'Gaurav Chandra',
    serviceSelections: [
      { createdByCrmUserId: '64b000000000000000000022', createdByName: 'Kshitij Trimukhe', createdByEmail: 'kshitij@example.com' }
    ]
  };
  const scope = {
    ids: ['64b000000000000000000022'],
    identities: ['64b000000000000000000022', 'Kshitij Trimukhe', 'kshitij@example.com']
  };

  assert.deepEqual(filterByScope([lead], scope), [lead]);
  assert.deepEqual(filterByScope([lead], scope, { assignedOnly: true }), [lead]);
});

test('proxy module has no CRM Lead or Client persistence dependency', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/ccpIntegrations.js'), 'utf8');
  assert.doesNotMatch(source, /models\/(Lead|Client)|\.create\(|insertMany|findOneAndUpdate|updateOne/);
  assert.match(source, /ccpApiUrl\(`ccp\/\$\{resource\}`\)/);
});

test('PUT complianceHealthReport uses CCP proxy without CRM persistence dependency', () => {
  const report = { conclusion: 'Ready', reviewedConfirmation: true };
  const payload = sanitizeLead({ workflowStatus: 'submitted', complianceHealthReport: report }, user, { isUpdate: true });
  assert.deepEqual(payload.complianceHealthReport, report);
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/ccpIntegrations.js'), 'utf8');
  assert.match(source, /router\.put\('\/leads\/:id'/);
  assert.doesNotMatch(source, /Lead\.find|Lead\.create|Client\.find|Client\.create/);
});
