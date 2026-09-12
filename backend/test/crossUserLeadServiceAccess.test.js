const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildAppendOnlyServicePatchInternal } = require('../src/controllers/leadController');

test('company search is global so another CRM user can find an existing lead', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const searchBlock = controller.slice(controller.indexOf('exports.searchCompanies'), controller.indexOf('exports.listLeads'));
  assert.match(searchBlock, /Lead\.find\(searchFilter\)/);
  assert.doesNotMatch(searchBlock, /leadAccessFilter\(req\.user\)/);
});

test('service contribution notifications use the selected service owner without replacing the stored lead owner', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  assert.match(controller, /const notificationLead = \{/);
  assert.match(controller, /generatedForUser: req\.body\.generatedForUser \|\| lead\.generatedForUser/);
  assert.match(controller, /afterLead: notificationLead/);
});

test('cross-user Add Services preserves existing rows and attributes only new rows to the actor', () => {
  const existingService = { assignedServiceId: 'service-1', servicesOffered: 'Registration', createdByName: 'Siddhesh' };
  const existingAddress = { assignedServiceId: 'service-1', city: 'Pune' };
  const incomingService = { assignedServiceId: 'service-2', servicesOffered: 'Annual Return', createdByName: 'Spoofed User' };
  const patch = buildAppendOnlyServicePatchInternal(
    { serviceSelections: [existingService], addresses: [existingAddress], contacts: [], assignments: [] },
    { company: 'Changed Company', serviceSelections: [{ ...existingService, servicesOffered: 'Changed' }, incomingService], addresses: [{ ...existingAddress, city: 'Changed' }, { assignedServiceId: 'service-2', city: 'Mumbai' }], contacts: [], assignments: [] },
    { _id: 'user-2', name: 'Second User', email: 'second@example.com' }
  );
  assert.deepEqual(patch.serviceSelections[0], existingService);
  assert.equal(patch.serviceSelections[1].createdByCrmUserId, 'user-2');
  assert.equal(patch.serviceSelections[1].createdByName, 'Second User');
  assert.equal(patch.addresses[0].city, 'Pune');
  assert.equal(patch.addresses[1].city, 'Mumbai');
  assert.equal(patch.company, undefined);
});

test('cross-user Add Services rejects a request that does not append a service', () => {
  assert.throws(() => buildAppendOnlyServicePatchInternal(
    { serviceSelections: [{ assignedServiceId: 'service-1' }] },
    { serviceSelections: [{ assignedServiceId: 'service-1' }] },
    { _id: 'user-2' }
  ), /requires at least one new service row/);
});

test('legacy leads keep their original top-level service when another user adds a row', () => {
  const patch = buildAppendOnlyServicePatchInternal(
    { _id: 'legacy-lead', company: 'Astral', servicesOffered: 'Registration', createdByName: 'Siddhesh', city: 'Pune' },
    { serviceSelections: [{ servicesOffered: 'Registration' }, { servicesOffered: 'Annual Return' }], addresses: [{ city: 'Pune' }, { city: 'Mumbai' }], contacts: [{}, {}], assignments: [{}, {}] },
    { _id: 'user-2', name: 'Second User' }
  );
  assert.equal(patch.serviceSelections[0].servicesOffered, 'Registration');
  assert.equal(patch.serviceSelections[0].createdByName, 'Siddhesh');
  assert.equal(patch.serviceSelections[1].createdByName, 'Second User');
  assert.equal(patch.addresses[0].city, 'Pune');
  assert.equal(patch.addresses[1].city, 'Mumbai');
});
