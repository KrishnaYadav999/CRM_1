const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/controllers/leadController');

const firstService = { industryType: 'Manufacturing', businessCategory: 'EPR Consultancy', eprCategory: 'Plastic Waste', applicantType: 'PIBO', piboCategory: 'Producer', servicesOffered: 'Registration', applicableService: 'Registration', firstAnnualReturnYearApplicable: '2025-26' };
const secondService = { industryType: 'Manufacturing', businessCategory: 'EPR Consultancy', eprCategory: 'E-Waste', applicantType: 'PIBO', piboCategory: 'Importer', servicesOffered: 'Annual Return', applicableService: 'Annual Filing', firstAnnualReturnYearApplicable: '2026-27' };

test('direct EPR applicant types submit without a separate PIBO category', () => {
  const error = _test.validateSubmittedLead({
    status: 'Qualified', company: 'Example Pvt Ltd', industryType: 'Manufacturing', businessCategory: 'EPR Consultancy', firstAnnualReturnYearApplicable: '2025-26', eprCategory: 'EPR - Battery Waste',
    applicantType: 'Recycler', servicesOffered: 'EPR - Battery Waste Compliance',
    addressLine1: 'Main Road', state: 'Maharashtra', city: 'Mumbai', pinCode: '400001',
    addresses: [{ addressLine1: 'Main Road', state: 'Maharashtra', city: 'Mumbai', pinCode: '400001' }],
    contacts: [{ salutation: 'Mr.', contactPerson: 'Jack', designation: 'Manager', emails: 'jack@example.com', mobileNo1: '9876543210', referredBy: 'Krishna', source: 'Referral' }]
  });
  assert.equal(error, '');
});

test('plastic applicant hierarchy still requires a sub applicant type', () => {
  const error = _test.validateSubmittedLead({
    status: 'Qualified', company: 'Example Pvt Ltd', industryType: 'Manufacturing', businessCategory: 'EPR Consultancy', firstAnnualReturnYearApplicable: '2025-26', eprCategory: 'EPR - Plastic Waste',
    applicantType: 'PIBO', servicesOffered: 'EPR - Plastic Compliance',
    addressLine1: 'Main Road', state: 'Maharashtra', city: 'Mumbai', pinCode: '400001'
  });
  assert.equal(error, 'Sub Applicant Type is required');
});

test('submitted leads require industry, business category, and financial year in every service row', () => {
  const error = _test.validateSubmittedLead({
    status: 'Qualified', company: 'Example Pvt Ltd', eprCategory: 'EPR - Battery Waste', applicantType: 'Recycler', servicesOffered: 'Compliance',
    addressLine1: 'Main Road', state: 'Maharashtra', city: 'Mumbai', pinCode: '400001',
    serviceSelections: [{ eprCategory: 'EPR - Battery Waste', applicantType: 'Recycler', servicesOffered: 'Compliance' }]
  });
  assert.equal(error, 'Service row 1: Industry Type, Business Category, Financial Year are required');
});

test('legacy top-level service and a different saved service are both preserved', () => {
  const rows = _test.normalizeLegacyBulkServices({ ...firstService, serviceSelections: [secondService] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].servicesOffered, 'Registration');
  assert.equal(rows[1].servicesOffered, 'Annual Return');
});

test('mirrored top-level service is not duplicated when already in serviceSelections', () => {
  const rows = _test.normalizeLegacyBulkServices({ ...firstService, serviceSelections: [firstService, secondService] });
  assert.equal(rows.length, 2);
});

test('bulk merge appends one service and keeps assignment rows aligned', () => {
  const merged = _test.buildBulkMergeData({
    company: 'Example Pvt Ltd', ...firstService, serviceSelections: [secondService],
    assignedToText: 'Manager One', assignments: [{ assignedToText: 'Manager Two' }]
  }, { ...firstService, servicesOffered: 'Compliance', assignedToText: 'Manager Three' }, { _id: 'user-1', name: 'Admin' });
  assert.equal(merged.serviceSelections.length, 3);
  assert.equal(merged.assignments.length, 3);
  assert.equal(merged.assignments[0].assignedToText, 'Manager One');
  assert.equal(merged.assignments[1].assignedToText, 'Manager Two');
  assert.equal(merged.assignments[2].assignedToText, 'Manager Three');
  assert.equal(merged.workflowStatus, 'draft');
  assert.equal(merged.bulkImported, true);
});

test('new bulk lead creates matching service and assignment arrays as a draft', () => {
  const created = _test.buildBulkCreateData({ company: 'New Company', ...firstService, assignedToText: 'Manager One', pinCode: '012345' }, { _id: 'admin-1', name: 'Admin' });
  assert.equal(created.serviceSelections.length, 1);
  assert.equal(created.assignments.length, 1);
  assert.equal(created.assignments[0].assignedToText, 'Manager One');
  assert.equal(created.pinCode, '012345');
  assert.equal(created.workflowStatus, 'draft');
  assert.equal(created.serviceSelections[0].subApplicantType, 'Producer');
  assert.equal(Object.hasOwn(created.serviceSelections[0], 'piboCategory'), false);
});

test('lead persistence normalizes legacy PIBO category keys to sub applicant type', () => {
  const cleaned = _test.cleanBody({
    piboCategory: 'Producer',
    serviceSelections: [{ eprCategory: 'Plastic Waste', piboCategory: 'Producer' }]
  });
  assert.equal(cleaned.subApplicantType, 'Producer');
  assert.equal(cleaned.serviceSelections[0].subApplicantType, 'Producer');
  assert.equal(Object.hasOwn(cleaned, 'piboCategory'), false);
  assert.equal(Object.hasOwn(cleaned.serviceSelections[0], 'piboCategory'), false);
});

test('incomplete draft rows still reserve aligned service and assignment rows', () => {
  const created = _test.buildBulkCreateData({ company: 'Draft Company' }, { _id: 'admin-1', name: 'Admin' });
  assert.equal(created.serviceSelections.length, 1);
  assert.equal(created.assignments.length, 1);
  const merged = _test.buildBulkMergeData(created, { company: 'Draft Company' }, { _id: 'admin-1', name: 'Admin' });
  assert.equal(merged.serviceSelections.length, 2);
  assert.equal(merged.assignments.length, 2);
});

test('bulk Created By resolves each row to its exact CRM user identity', () => {
  const users = [
    { _id: 'user-1', crmUserId: 'ATPL-001', name: 'Shivani Sharma', email: 'shivani@example.com' },
    { _id: 'user-2', crmUserId: 'ATPL-002', name: 'Ashmita Kundu', email: 'ashmita@example.com' }
  ];
  const index = _test.buildBulkUserIndex(users);
  assert.equal(_test.resolveBulkCreator(index, 'Shivani Sharma')._id, 'user-1');
  assert.equal(_test.resolveBulkCreator(index, 'ashmita@example.com')._id, 'user-2');
  assert.equal(_test.resolveBulkCreator(index, 'ATPL-001').email, 'shivani@example.com');
  assert.equal(_test.resolveBulkCreator(index, 'Unknown User'), null);
});

test('bulk service ownership uses the resolved row creator instead of the uploader', () => {
  const creator = { _id: 'creator-1', name: 'Lead Owner', email: 'owner@example.com' };
  const created = _test.buildBulkCreateData({ company: 'Owned Company', ...firstService, importedCreatedBy: creator.name }, creator);
  assert.equal(created.serviceSelections[0].createdByCrmUserId, 'creator-1');
  assert.equal(created.serviceSelections[0].createdByName, 'Lead Owner');
  assert.equal(created.serviceSelections[0].createdByEmail, 'owner@example.com');
});

test('saving a new follow-up identifies the service row whose red flag must reset', () => {
  const before = { serviceSelections: [{ nextFollowUpDate: '2026-08-05', nextFollowUpTime: '10:00', followUpRemarks: 'Call client' }] };
  const after = { serviceSelections: [{ nextFollowUpDate: '2026-08-06', nextFollowUpTime: '11:00', followUpRemarks: 'Call client again' }] };
  assert.deepEqual(_test.changedFollowUpIndexes(before, after), [0]);
  assert.deepEqual(_test.changedFollowUpIndexes(before, before), []);
});
