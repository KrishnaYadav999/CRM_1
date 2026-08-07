const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/controllers/leadController');

const own = { industryType: 'Manufacturing', eprCategory: 'EPR - Plastic Waste', applicantType: 'PIBO', subApplicantType: 'Brand Owner', servicesOffered: 'Compliance', firstAnnualReturnYearApplicable: '2025-26', createdByCrmUserId: 'user-1', createdByEmail: 'user1@example.com' };
const other = { industryType: 'Electronics', eprCategory: 'EPR - E-Waste', applicantType: 'Producer', servicesOffered: 'Registration', firstAnnualReturnYearApplicable: '2025-26', createdByCrmUserId: 'user-2', createdByEmail: 'user2@example.com' };

test('a user can remove a service row they created', () => {
  const error = _test.validateServiceRemovalPermission({ serviceSelections: [own, other] }, [other], { _id: 'user-1', email: 'user1@example.com', role: 'operation' });
  assert.equal(error, '');
});

test('a user cannot remove another user service row', () => {
  const error = _test.validateServiceRemovalPermission({ serviceSelections: [own, other] }, [own], { _id: 'user-1', email: 'user1@example.com', role: 'operation' });
  assert.equal(error, 'You can remove only services that you created.');
});

test('admin and superadmin can remove any service row', () => {
  assert.equal(_test.validateServiceRemovalPermission({ serviceSelections: [own, other] }, [], { role: 'admin' }), '');
  assert.equal(_test.validateServiceRemovalPermission({ serviceSelections: [own, other] }, [], { role: 'superadmin' }), '');
});

test('an assigned manager or staff can remove an obsolete service before PO submit', () => {
  const lead = {
    serviceSelections: [own, other],
    assignments: [{ assignedTo: 'manager-1', assignedToEmail: 'manager@example.com', assignedStaff: 'staff-1', assignedStaffEmail: 'staff@example.com' }]
  };
  assert.equal(_test.validateServiceRemovalPermission(lead, [other], { _id: 'manager-1', email: 'manager@example.com', role: 'manager' }), '');
  assert.equal(_test.validateServiceRemovalPermission(lead, [other], { _id: 'staff-1', email: 'staff@example.com', role: 'operation' }), '');
});
