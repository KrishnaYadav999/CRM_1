const test = require('node:test');
const assert = require('node:assert/strict');
const { getVisibleUserScope } = require('../src/utils/visibilityScope');
const { overallLeadFilter, createOverallServiceVisibility } = require('../src/services/overallDashboardVisibility');
const { overallRecordsFromLeads } = require('../src/services/overallDashboardData');
const { buildOverall } = require('../src/services/overallDashboard');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const manager = { _id: 'manager', name: 'Manager', email: 'manager@example.test', role: 'manager' };
const alice = { _id: 'alice', name: 'Alice', email: 'alice@example.test', role: 'operation' };
const bob = { _id: 'bob', name: 'Bob', email: 'bob@example.test', role: 'sales' };
const query = (rows) => ({ select() { return this; }, lean: async () => rows });
const scopeFor = (users) => ({ ids: users.map((user) => user._id), identities: users.flatMap((user) => [user._id, user.name, user.email]) });
const sharedLead = {
  _id: 'shared', company: 'CCL', createdBy: 'alice',
  serviceSelections: [{ subApplicantType: 'Producer' }, { subApplicantType: 'Producer' }, { subApplicantType: 'Producer' }],
  assignments: [
    { assignedStaff: 'alice', closedAt: '2026-10-01', poYearRows: [{ fy: '2026-27', hasPoEvidence: true, services: ['New Registration'] }] },
    { assignedStaff: 'bob', closedAt: '2026-10-01', poYearRows: [{ fy: '2026-27', hasPoEvidence: true, services: ['Consulting'] }] },
    { assignedStaff: 'manager', closedAt: '2026-10-01', poYearRows: [{ fy: '2027-28', hasPoEvidence: true, services: ['Account Closure'] }] }
  ]
};

test('Admin and Super Admin see all users, including roles in the secondary role list', async () => {
  for (const user of [{ _id: 'admin', role: 'admin' }, { _id: 'super', role: 'superadmin' }, { _id: 'multi', role: 'operation', roles: ['super-admin'] }]) {
    const scope = await getVisibleUserScope(user);
    assert.equal(scope, null);
    assert.deepEqual(overallLeadFilter(scope), {});
    assert.equal(overallRecordsFromLeads([sharedLead], scope).length, 3);
  }
});
test('logged-in user sees only their services, counts, FY options and drill-down data', async () => {
  const scope = await getVisibleUserScope(alice);
  assert.deepEqual(scope.ids, ['alice']);
  const records = overallRecordsFromLeads([sharedLead], scope);
  assert.equal(records.length, 1);
  const data = buildOverall(records);
  assert.deepEqual(data.yearOptions, ['2025-26', '2026-27']);
  assert.equal(data.summary.clients, 1);
  const producer = data.groups.find((group) => group.type === 'Producer');
  assert.equal(producer.services['New Registration'], 1);
  assert.equal(producer.services.Consulting, undefined);
  assert.equal(producer.clients[0].services.Consulting, undefined);
});
test('manager sees self plus reporting users and team members, excluding outsiders', async (t) => {
  t.mock.method(Team, 'find', (filter) => { assert.equal(filter.manager, 'manager'); return query([{ _id: 'team', members: ['alice'] }]); });
  t.mock.method(User, 'find', (filter) => {
    assert.ok(filter.$or.some((entry) => entry.managerId === 'manager'));
    assert.ok(filter.$or.some((entry) => entry.teamId?.$in.includes('team')));
    assert.ok(filter.$or.some((entry) => entry._id?.$in.includes('alice')));
    return query([alice]);
  });
  const scope = await getVisibleUserScope(manager);
  assert.deepEqual(scope.ids, ['manager', 'alice']);
  const records = overallRecordsFromLeads([sharedLead], scope);
  assert.equal(records.length, 2);
  assert.ok(records.every((row) => !row.services.some((service) => service.name === 'Consulting')));
  assert.equal(buildOverall(records, [], '2026-27').groups.find((group) => group.type === 'Producer').services.Consulting, undefined);
});
test('service contributor identities and legacy assignments are scoped with stable-id priority', () => {
  const visible = createOverallServiceVisibility(scopeFor([alice]));
  assert.equal(visible({}, { createdByCrmUserId: 'alice' }, {}), true);
  assert.equal(visible({}, { createdByEmail: 'ALICE@example.test' }, {}), true);
  assert.equal(visible({}, {}, { assignedStaffText: 'Alice' }), true);
  assert.equal(visible({ createdBy: 'alice' }, {}, { assignedStaff: 'bob', assignedStaffText: 'Alice' }), false);
  assert.equal(visible({}, { createdBy: 'bob', createdByEmail: 'alice@example.test' }, {}), false);
  assert.equal(visible({ createdBy: 'alice' }, {}, { closedBy: 'bob' }), true);
  assert.equal(visible({ createdBy: 'bob' }, {}, { closedBy: 'alice' }), false);
});
test('on-behalf leads belong to the intended user and missing identity never grants access', () => {
  const visible = createOverallServiceVisibility(scopeFor([alice]));
  assert.equal(visible({ createdBy: 'admin', generatedForUser: 'alice' }, {}, {}), true);
  assert.equal(visible({ createdBy: 'alice', generatedForUser: 'bob' }, {}, {}), false);
  assert.equal(visible({}, {}, {}), false);
  assert.equal(createOverallServiceVisibility({ ids: [], identities: [] })(sharedLead, {}, sharedLead.assignments[0]), false);
});
test('database candidate filter includes service owners and generated-for users', () => {
  const filter = overallLeadFilter(scopeFor([bob]));
  assert.ok(filter.$or.some((entry) => entry.generatedForUser?.$in.includes('bob')));
  assert.ok(filter.$or.some((entry) => entry['serviceSelections.createdByEmail']?.$regex === '^bob@example\\.test$'));
});
