const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/routes/ccpIntegrations');

test('royalty is eligible when Gaurav owns the original service and Mihir adds another service', () => {
  const lead = {
    createdByCrmUserId: 'gaurav-id',
    createdByEmail: 'gaurav@example.com',
    importedCreatedBy: 'GAURAV CHANDRA',
    serviceSelections: [
      { createdByCrmUserId: 'gaurav-id', createdByName: 'GAURAV CHANDRA', createdByEmail: 'gaurav@example.com' },
      { createdByCrmUserId: 'mihir-id', createdByName: 'Mihirdevsinh Zala', createdByEmail: 'mihir@example.com' }
    ]
  };
  const result = _test.royaltyContributorEligibility(lead, {
    _id: 'mihir-id',
    name: 'Mihirdevsinh Zala',
    email: 'mihir@example.com'
  });
  assert.equal(result.eligible, true);
  assert.equal(result.distinctContributors.length, 2);
});

test('royalty remains ineligible when the second service has not stored its owner', () => {
  const lead = {
    createdByCrmUserId: 'gaurav-id',
    importedCreatedBy: 'GAURAV CHANDRA',
    serviceSelections: [
      { createdByCrmUserId: 'gaurav-id', createdByName: 'GAURAV CHANDRA' },
      { servicesOffered: 'Annual Filing' }
    ]
  };
  const result = _test.royaltyContributorEligibility(lead, { _id: 'mihir-id', name: 'Mihirdevsinh Zala' });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'insufficient-contributors');
});

test('Sales user can preserve a frozen staff assignment while adding a manager on a new service row', () => {
  const existing = [{
    closedBy: 'gaurav-id',
    assignedTo: 'tushar-id',
    assignedStaff: 'prachi-id',
    assignedStaffText: 'PRACHI CHAVAN',
    assignedStaffEmail: 'prachi@example.com'
  }];
  const submitted = [
    { ...existing[0] },
    { closedBy: 'mihir-id', assignedTo: 'tushar-id', assignedStaff: '', assignedStaffText: '', assignedStaffEmail: '' }
  ];
  const result = _test.enforceAssignmentPermissions(submitted, existing, {
    _id: 'mihir-id',
    role: 'sales',
    name: 'Mihirdevsinh Zala'
  });
  assert.equal(result[0].assignedStaff, 'prachi-id');
  assert.equal(result[1].assignedTo, 'tushar-id');
  assert.equal(result[1].assignedStaff, '');
});

test('Sales user cannot overwrite an existing manager-to-staff assignment', () => {
  const existing = [{ assignedTo: 'tushar-id', assignedStaff: 'prachi-id', assignedStaffText: 'PRACHI CHAVAN' }];
  const submitted = [{ assignedTo: 'tushar-id', assignedStaff: 'other-id', assignedStaffText: 'OTHER USER' }];
  const [result] = _test.enforceAssignmentPermissions(submitted, existing, { _id: 'mihir-id', role: 'sales' });
  assert.equal(result.assignedStaff, 'prachi-id');
  assert.equal(result.assignedStaffText, 'PRACHI CHAVAN');
});
