const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const { getVisibleUserScope, ownerFilter } = require('../src/utils/visibilityScope');

test('a regular user receives only their own identity scope', async () => {
  const scope = await getVisibleUserScope({ _id: 'new-user-id', role: 'operation', email: 'new.user@example.com' });
  assert.deepEqual(scope.ids, ['new-user-id']);
  assert.deepEqual(scope.identities, ['new-user-id', 'new.user@example.com']);
  assert.deepEqual(ownerFilter(scope), { $or: [
    { createdBy: { $in: ['new-user-id'] } },
    { assignedTo: { $in: ['new-user-id'] } }
  ] });
});

test('admins and super admins receive unrestricted scope', async () => {
  assert.equal(await getVisibleUserScope({ _id: 'admin-id', role: 'admin' }), null);
  assert.equal(await getVisibleUserScope({ _id: 'super-id', roles: ['operation', 'superadmin'] }), null);
  assert.equal(await getVisibleUserScope({ _id: 'super-spaced-id', role: 'Super Admin' }), null);
});

test('a manager scope includes self, direct reports and managed-team members', async (t) => {
  const originalTeamFind = Team.find;
  const originalUserFind = User.find;
  Team.find = () => ({ select: () => ({ lean: async () => [{ _id: 'team-1', members: ['member-1'] }] }) });
  User.find = () => ({ select: () => ({ lean: async () => [
    { _id: 'report-1', crmUserId: 'CRM-22', name: 'Direct Report', email: 'report@example.com' },
    { _id: 'member-1', name: 'Team Member', email: 'member@example.com' }
  ] }) });
  t.after(() => { Team.find = originalTeamFind; User.find = originalUserFind; });
  const scope = await getVisibleUserScope({ _id: 'manager-1', role: 'manager', name: 'Manager', email: 'manager@example.com' });
  assert.deepEqual(scope.ids, ['manager-1', 'report-1', 'member-1']);
  assert.ok(scope.identities.includes('CRM-22'));
  assert.ok(scope.identities.includes('member@example.com'));
});

test('owner filters keep object-id paths separate from legacy text identities', () => {
  const filter = ownerFilter(
    { ids: ['user-1'], identities: ['User One'] },
    'createdBy', 'assignedTo', ['assignedToText'], ['generatedForUser']
  );
  assert.deepEqual(filter.$or, [
    { createdBy: { $in: ['user-1'] } },
    { assignedTo: { $in: ['user-1'] } },
    { generatedForUser: { $in: ['user-1'] } },
    { assignedToText: { $regex: '^User One$', $options: 'i' } }
  ]);
});

test('an unauthenticated identity never receives a readable catalog scope', async () => {
  const scope = await getVisibleUserScope(null);
  assert.deepEqual(scope, { ids: [], identities: [] });
  assert.deepEqual(ownerFilter(scope), { _id: { $exists: false } });
});
