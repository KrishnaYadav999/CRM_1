const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOverall } = require('../src/services/overallDashboard');
const { overallRecordsFromLeads } = require('../src/services/overallDashboardData');
const { buildUserSections } = require('../src/services/overallDashboardUsers');

test('dashboard hides credit, merges annual aliases and puts most used closed services first', () => {
  const row = (clientName, service, isClosed = true) => ({ clientName, financialYear: '2025-26', subApplicantType: 'Producer', isClosed, services: [{ name: service }] });
  const section = buildOverall([row('CCL', 'New Registration'), row('CCL', 'Annual Filling'), row('CCL', 'Annual Return Filling / Annual Filling'), row('20 Micron', 'Annual Return Filling'), row('CCL', 'Credit Procurement'), row('CCL', 'Consulting', false)]).yearSections[0];
  assert.deepEqual(section.services, ['Annual Return Filling', 'New Registration']);
  assert.equal(section.groups[0].services['Annual Return Filling'], 2);
  assert.equal(section.summary.clients, 2);
  assert.equal(section.summary.services, 3);
});

test('user matrix keeps service ownership separate and never includes users outside supplied scope', () => {
  const users = [{ _id: 'krishna', name: 'Krishna', email: 'k@example.test' }, { _id: 'manager', name: 'Manager' }];
  const leads = [{ _id: 'lead', company: 'CCL', createdBy: 'manager', serviceSelections: [
    { createdBy: 'krishna', subApplicantType: 'Producer', servicesOffered: 'New Registration' },
    { createdBy: 'outsider', subApplicantType: 'Brand Owner', servicesOffered: 'Consulting' }
  ], assignments: [{ closedAt: 'now', poYearRows: [{ fy: '2025-26', hasPoEvidence: true }] }, { closedAt: 'now', poYearRows: [{ fy: '2025-26', hasPoEvidence: true }] }] }];
  const records = overallRecordsFromLeads(leads);
  const rows = buildUserSections(records, [], users);
  assert.equal(rows.length, 2);
  const krishna = rows[0].yearSections[0];
  assert.equal(krishna.summary.clients, 1);
  assert.deepEqual(krishna.services, ['New Registration']);
  assert.equal(krishna.groups.find((group) => group.type === 'Producer').count, 1);
  assert.equal(krishna.groups.find((group) => group.type === 'Brand Owner').count, 0);
  assert.equal(rows[1].yearSections[0].summary.clients, 0);
});

test('user matrix supports on-behalf legacy owners and prefers stable IDs to identical names', () => {
  const leads = [{ _id: 'lead', company: '20 Micron', createdBy: 'admin', generatedForUser: 'intended', generatedForName: 'Same Name', serviceSelections: [{ subApplicantType: 'Importer', servicesOffered: 'Consulting' }], assignments: [{ closedAt: 'now', poYearRows: [{ fy: '2026-27', hasPoEvidence: true }] }] }];
  const rows = buildUserSections(overallRecordsFromLeads(leads), [], [{ _id: 'intended', name: 'Same Name' }, { _id: 'other', name: 'Same Name' }]);
  assert.equal(rows[0].yearSections[1].summary.clients, 1);
  assert.equal(rows[1].yearSections[0].summary.clients, 0);
});
