const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeClientMasterData, buildUserProductivityReport, clientSectionAnalysis, productivityScore } = require('../src/services/userProductivityReport');

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

test('company drill-down calculates section completion without exposing sensitive fields', () => {
  const sections = clientSectionAnalysis({ basic: { clientLegalName: 'ABC Ltd', tradeName: '' }, cpcb: { loginId: 'abc', loginPassword: 'secret' } });
  const basic = sections.find((section) => section.name === 'Basic');
  const cpcb = sections.find((section) => section.name === 'Cpcb');
  assert.deepEqual({ filled: basic.filled, missing: basic.missing, percentage: basic.percentage }, { filled: 1, missing: 1, percentage: 50 });
  assert.deepEqual({ filled: cpcb.filled, missing: cpcb.missing, total: cpcb.total }, { filled: 1, missing: 0, total: 1 });
});

test('super admin sales drill-down is wired to API, status filters, risks and report download', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/dashboard/UserWorkDrilldown.jsx'), 'utf8');
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/auth.js'), 'utf8');
  assert.match(routes, /superadmin\/users\/:id\/work-report/);
  assert.match(page, /Sales Company Portfolio/);
  assert.match(page, /Lead Open/);
  assert.match(page, /Complete Follow-up Timeline/);
  assert.match(page, /Missed Follow-ups/);
  assert.match(page, /Red Flags/);
  assert.match(page, /\['Open','Closed'\]/);
  assert.match(page, /Download Report/);
});

test('full company analysis covers every Client Master section and respects applicability', () => {
  const notApplicable = analyzeClientMasterData({ compliance: { msmeApplicable: 'No' }, cpcb: { linkedToCommonPortal: 'No' } });
  assert.ok(notApplicable.totalCount > 50);
  assert.ok(!notApplicable.missingFields.some((label) => label.includes('MSME 1')));
  assert.ok(!notApplicable.missingFields.includes('CEPR Password'));
  const applicable = analyzeClientMasterData({ compliance: { msmeApplicable: 'Yes' }, cpcb: { linkedToCommonPortal: 'Yes' } });
  assert.ok(applicable.missingFields.includes('MSME 1 Udyam Number'));
  assert.ok(applicable.missingFields.includes('CEPR Password'));
  assert.ok(applicable.sections.some((section) => section.name === 'Authorized Person Details'));
});
