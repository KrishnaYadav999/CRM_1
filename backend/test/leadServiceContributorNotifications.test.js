const test = require('node:test');
const assert = require('node:assert/strict');
const {
  groupServicesByUser,
  newlyAddedServices,
  serviceWasDelegatedToOriginalCreator
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

test('service delegated by another user back to the original creator does not require approval', () => {
  const delegated = serviceWasDelegatedToOriginalCreator({
    beforeLead: { createdByCrmUserId: 'user-a', createdByName: 'User A' },
    afterLead: { generatedForUser: 'user-a', generatedForName: 'User A' },
    actor: { _id: 'user-b', name: 'User B' },
    creator: { _id: 'user-a', name: 'User A' }
  });
  assert.equal(delegated, true);
});

test('service added by another user for themselves still requires approval', () => {
  const delegated = serviceWasDelegatedToOriginalCreator({
    beforeLead: { createdByCrmUserId: 'user-a', createdByName: 'User A' },
    afterLead: { generatedForUser: 'user-b', generatedForName: 'User B' },
    actor: { _id: 'user-b', name: 'User B' },
    creator: { _id: 'user-a', name: 'User A' }
  });
  assert.equal(delegated, false);
});
