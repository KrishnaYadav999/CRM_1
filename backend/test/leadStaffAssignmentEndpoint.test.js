const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _test } = require('../src/controllers/leadController');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('staff assignment permission is limited to administrators and the row manager', () => {
  const assignment = { assignedTo: { _id: 'manager-mongo-id' }, assignedToEmail: 'manager@example.com' };

  assert.equal(_test.canAssignStaffToRow({ role: 'admin', _id: 'another-user' }, assignment), true);
  assert.equal(_test.canAssignStaffToRow({ role: 'manager', _id: 'manager-mongo-id' }, assignment), true);
  assert.equal(_test.canAssignStaffToRow({ roles: ['Manager'], email: 'MANAGER@example.com' }, assignment), true);
  assert.equal(_test.canAssignStaffToRow({ role: 'manager', _id: 'different-manager' }, assignment), false);
  assert.equal(_test.canAssignStaffToRow({ role: 'operation', _id: 'manager-mongo-id' }, assignment), false);
});

test('staff lookup supports Mongo IDs and CRM user IDs without accepting inactive users', () => {
  const mongoId = '6a7426233e6eb1b90295ee19';
  assert.deepEqual(_test.activeUserLookup(mongoId), {
    isActive: { $ne: false },
    $or: [{ crmUserId: mongoId }, { email: mongoId }, { _id: mongoId }]
  });
  assert.deepEqual(_test.activeUserLookup('CRM-STAFF-17'), {
    isActive: { $ne: false },
    $or: [{ crmUserId: 'CRM-STAFF-17' }, { email: 'crm-staff-17' }]
  });
});

test('frontend uses the row-scoped staff endpoint and handles rejected requests', () => {
  const routes = read('../src/routes/leads.js');
  const endpoints = read('../../frontend/src/services/apiEndpoints.js');
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');

  assert.match(routes, /patch\('\/:id\/assignments\/:rowIndex\/staff', requireAuth, leadCtrl\.assignLeadStaff\)/);
  assert.match(endpoints, /staffAssignment: \(id, rowIndex\)/);
  assert.match(page, /api\.patch\(API_ENDPOINTS\.leads\.staffAssignment\(leadId, index\)/);
  assert.match(page, /Unable to assign the staff member/);
  assert.doesNotMatch(page.slice(page.indexOf('async function assignStaffFromDetail'), page.indexOf('function requestStaffAssignmentFromDetail')), /api\.put\(API_ENDPOINTS\.leads\.detail/);
});
