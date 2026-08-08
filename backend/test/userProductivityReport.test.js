const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUserProductivityReport, productivityScore } = require('../src/services/userProductivityReport');

function user(id, name) {
  return { _id: id, name, email: `${name.toLowerCase()}@example.com`, role: 'operation', isActive: true, lastLogin: new Date('2026-08-08T04:30:00.000Z') };
}

test('ticket aggregation maps 5, 0, and 2 raised tickets to the correct users and KPI', () => {
  const report = buildUserProductivityReport({
    users: [user('u-a', 'User A'), user('u-b', 'User B'), user('u-c', 'User C')],
    sessions: [], activities: [], leads: [],
    ticketStats: [
      { _id: 'u-a', total: 5, open: 3, resolved: 2 },
      { _id: 'u-c', total: 2, open: 0, resolved: 2 }
    ],
    period: { from: '2026-08-07', to: '2026-08-08' },
    now: new Date('2026-08-08T06:00:00.000Z')
  });
  const byName = new Map(report.users.map((row) => [row.name, row]));
  assert.deepEqual(byName.get('User A').tickets, { total: 5, open: 3, resolved: 2 });
  assert.deepEqual(byName.get('User B').tickets, { total: 0, open: 0, resolved: 0 });
  assert.deepEqual(byName.get('User C').tickets, { total: 2, open: 0, resolved: 2 });
  assert.equal(report.summary.supportTickets, 7);
  assert.equal(report.summary.openTickets, 3);
  assert.equal(report.summary.resolvedTickets, 4);
});

test('existing 100-point productivity formula remains unchanged', () => {
  assert.equal(productivityScore({ openSeconds: 100, activeSeconds: 60, activityCount: 99, closedLeads: 2 }), 56);
  assert.equal(productivityScore({ openSeconds: 0, activeSeconds: 0, activityCount: 0, closedLeads: 0 }), 0);
});

test('report service uses grouped ticket aggregation instead of per-user queries', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/userProductivityReport.js'), 'utf8');
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /SupportTicket\.aggregate\(\[/);
  assert.match(source, /\$group:\s*\{/);
  assert.match(source, /_id: '\$createdBy'/);
  assert.match(source, /createdAt: \{ \$gte: period\.start, \$lte: period\.end \}/);
});
