const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/controllers/leadController');

const firstService = { industryType: 'Manufacturing', eprCategory: 'Plastic Waste', applicantType: 'PIBO', piboCategory: 'Producer', servicesOffered: 'Registration', applicableService: 'Registration', firstAnnualReturnYearApplicable: '2025-26' };
const secondService = { industryType: 'Manufacturing', eprCategory: 'E-Waste', applicantType: 'PIBO', piboCategory: 'Importer', servicesOffered: 'Annual Return', applicableService: 'Annual Filing', firstAnnualReturnYearApplicable: '2026-27' };

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
});

test('new bulk lead creates matching service and assignment arrays as a draft', () => {
  const created = _test.buildBulkCreateData({ company: 'New Company', ...firstService, assignedToText: 'Manager One', pinCode: '012345' }, { _id: 'admin-1', name: 'Admin' });
  assert.equal(created.serviceSelections.length, 1);
  assert.equal(created.assignments.length, 1);
  assert.equal(created.assignments[0].assignedToText, 'Manager One');
  assert.equal(created.pinCode, '012345');
  assert.equal(created.workflowStatus, 'draft');
});

test('incomplete draft rows still reserve aligned service and assignment rows', () => {
  const created = _test.buildBulkCreateData({ company: 'Draft Company' }, { _id: 'admin-1', name: 'Admin' });
  assert.equal(created.serviceSelections.length, 1);
  assert.equal(created.assignments.length, 1);
  const merged = _test.buildBulkMergeData(created, { company: 'Draft Company' }, { _id: 'admin-1', name: 'Admin' });
  assert.equal(merged.serviceSelections.length, 2);
  assert.equal(merged.assignments.length, 2);
});
