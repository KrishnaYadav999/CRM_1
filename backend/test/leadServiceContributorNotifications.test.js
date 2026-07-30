const test = require('node:test');
const assert = require('node:assert/strict');
const {
  groupServicesByUser,
  newlyAddedServices
} = require('../src/services/leadServiceContributorNotifications');

test('additional service detection returns only rows added after the existing lead snapshot', () => {
  const beforeLead = {
    serviceSelections: [
      { industryType: 'Automotive', servicesOffered: 'Plastic Compliance', applicableService: 'Annual Return Filing' }
    ]
  };
  const afterLead = {
    serviceSelections: [
      { industryType: 'Automotive', servicesOffered: 'Plastic Compliance', applicableService: 'Annual Return Filing' },
      { industryType: 'Chemicals', servicesOffered: 'Battery Waste Compliance', applicableService: 'Registration' }
    ]
  };

  assert.deepEqual(newlyAddedServices(beforeLead, afterLead), [afterLead.serviceSelections[1]]);
});

test('user-wise service summary keeps original creator and contributor counts separate', () => {
  const groups = groupServicesByUser({
    importedCreatedBy: 'Gaurav Chandra',
    serviceSelections: [
      { servicesOffered: 'Plastic Compliance', createdByName: 'Gaurav Chandra' },
      { servicesOffered: 'Battery Waste Compliance', createdByName: 'Kshitij Trimukhe' },
      { servicesOffered: 'Battery Waste Compliance', createdByName: 'Gaurav Chandra' }
    ]
  });

  assert.deepEqual(groups.map((group) => [group.user, group.services.length]), [
    ['Gaurav Chandra', 2],
    ['Kshitij Trimukhe', 1]
  ]);
});
