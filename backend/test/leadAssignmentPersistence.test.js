const test = require('node:test');
const assert = require('node:assert/strict');
const {
  leadKeys,
  mergeAssignmentOverrides
} = require('../src/services/leadAssignmentPersistence');

test('lead assignment database override survives a refreshed CRM lead response', () => {
  const refreshedLead = {
    _id: '6a634f8eacfed5478344594b',
    company: 'Example Company',
    assignments: [
      { assignedStaff: '', assignedStaffText: '' },
      { assignedStaff: '', assignedStaffText: '' },
      { assignedStaff: '', assignedStaffText: '' }
    ]
  };
  const savedAssignments = [
    { assignedStaff: 'staff-1', assignedStaffText: 'Shubham' },
    { assignedStaff: 'staff-2', assignedStaffText: 'Sonal' },
    { assignedStaff: 'staff-3', assignedStaffText: 'Prachi' }
  ];

  const [merged] = mergeAssignmentOverrides([refreshedLead], [{
    leadKey: refreshedLead._id,
    assignments: savedAssignments
  }]);

  assert.equal(merged.company, 'Example Company');
  assert.deepEqual(merged.assignments, savedAssignments);
  assert.equal(merged.assignedStaffText, 'Shubham');
});

test('all stable CRM lead identities can locate a saved assignment override', () => {
  assert.deepEqual(
    leadKeys({ _id: 'mongo-id', sourceLeadId: 'source-id', externalLeadId: 'external-id' }),
    ['mongo-id', 'source-id', 'external-id']
  );
});

test('different industry types remain attached to their individual service rows after refresh', () => {
  const lead = {
    _id: 'lead-with-three-services',
    industryType: 'Plastic Recycling',
    serviceSelections: [
      { industryType: 'Plastic Recycling' },
      { industryType: 'Plastic Recycling' },
      { industryType: 'Plastic Recycling' }
    ]
  };
  const savedServiceSelections = [
    { industryType: 'Automotive', servicesOffered: 'Service A' },
    { industryType: 'E-Waste Recycler', servicesOffered: 'Service B' },
    { industryType: 'Plastic Recycling', servicesOffered: 'Service C' }
  ];

  const [merged] = mergeAssignmentOverrides([lead], [{
    leadKey: lead._id,
    serviceSelections: savedServiceSelections
  }]);

  assert.deepEqual(
    merged.serviceSelections.map((row) => row.industryType),
    ['Automotive', 'E-Waste Recycler', 'Plastic Recycling']
  );
  assert.equal(merged.industryType, 'Automotive');
});
