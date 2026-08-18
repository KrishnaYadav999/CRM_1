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
  assert.match(source, /Lead\.find\(ownerFilter\)/);
});

test('productivity report limits heavy telemetry queries and falls back per dataset', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/userProductivityReport.js'), 'utf8');
  assert.match(source, /async function reportQuery\(label, query, fallback = \[\]\)/);
  assert.match(source, /\.limit\(5000\)\.maxTimeMS\(15000\)/);
  assert.match(source, /\.limit\(10000\)\.maxTimeMS\(15000\)/);
  assert.match(source, /REPORT_CACHE_TTL_MS = 60 \* 1000/);
  assert.match(source, /managerId: entityId\(team\.manager\)/);
  assert.match(source, /memberIds: \(team\.members \|\| \[\]\)\.map\(entityId\)\.filter\(Boolean\)/);
});

test('productivity rows include manager hierarchy and Client Master completion totals', () => {
  const report = buildUserProductivityReport({
    users: [{ ...user('manager-1', 'Tushar Manager'), role: 'manager' }, { ...user('user-1', 'Prachi User'), managerId: 'manager-1' }],
    sessions: [], activities: [], leads: [], ticketStats: [],
    clients: [{ createdBy: 'user-1', data: { companyOverview: { companyName: 'Example Pvt Ltd' } } }],
    period: { from: '2026-08-07', to: '2026-08-08' }, now: new Date('2026-08-08T06:00:00.000Z')
  });
  const member = report.users.find((row) => row.name === 'Prachi User');
  assert.equal(String(member.managerId), 'manager-1');
  assert.equal(member.clientMasters, 1);
  assert.ok(member.clientFieldsFilled > 0);
  assert.ok(member.clientFieldsMissing > 0);
  assert.ok(member.clientCompletionPercentage > 0 && member.clientCompletionPercentage < 100);
});

test('Operation MIS includes draft and submitted Client Masters as separate totals', () => {
  const report = buildUserProductivityReport({
    users: [user('operation-1', 'Operation User')],
    sessions: [], activities: [], leads: [], ticketStats: [],
    clients: [
      { createdBy: 'operation-1', workflowStatus: 'draft', data: {} },
      { createdBy: 'operation-1', workflowStatus: 'draft', data: {} },
      { createdBy: 'operation-1', workflowStatus: 'submitted', data: {} }
    ],
    period: { from: '2026-08-01', to: '2026-08-18' }, now: new Date('2026-08-18T06:00:00.000Z')
  });
  const operation = report.users[0];
  assert.equal(operation.clientMasters, 3);
  assert.equal(operation.draftClients, 2);
  assert.equal(operation.submittedClients, 1);
});

test('Operation MIS database query does not exclude draft Client Masters', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/userProductivityReport.js'), 'utf8');
  assert.match(source, /Client\.find\(\{ \.\.\.ownerFilter, createdAt:/);
  assert.doesNotMatch(source, /Client\.find\(\{ \.\.\.ownerFilter, workflowStatus: 'submitted'/);
});

test('Sales MIS counts complete lead ownership across legacy creator identities', () => {
  const gaurav = { ...user('user-gaurav', 'Gaurav Chandra'), crmUserId: 'CRM-42', email: 'gaurav@example.com', role: 'sales' };
  const leads = [
    { createdBy: 'user-gaurav', status: 'Open' },
    { createdByCrmUserId: 'CRM-42', status: 'Open' },
    { createdByEmail: 'GAURAV@EXAMPLE.COM', closedAt: new Date() },
    { createdByName: '  Gaurav   Chandra ', status: 'Closed' },
    { importedCreatedBy: 'Gaurav Chandra', status: 'Open' }
  ];
  const report = buildUserProductivityReport({ users: [gaurav], sessions: [], activities: [], leads, clients: [], ticketStats: [], period: { from: '2026-08-08', to: '2026-08-14' } });
  assert.equal(report.users[0].totalLeads, 5);
  assert.equal(report.users[0].closedLeads, 2);
  assert.equal(report.users[0].openLeads, 3);
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
  assert.match(page, /Search company/);
  assert.match(page, /Open Leads/);
  assert.match(page, /Follow-up Timeline/);
  assert.match(page, /Missed Follow-ups/);
  assert.match(page, /Red Flags/);
  assert.match(page, /\['Open','Closed'\]/);
  assert.match(page, /Download Report/);
  assert.match(page, /fixed inset-0 z-\[130\] flex flex-col/);
  assert.match(page, /CompanyInsight/);
  assert.match(page, /Rows per page/);
  assert.match(page, /pageSize/);
  assert.match(page, /Next Action/);
  assert.match(page, /Owner/);
  assert.match(page, /Client Master Analysis/);
  assert.match(page, /Filled vs Missing Data/);
  assert.match(page, /Section-wise Completion/);
  assert.match(page, /Manager Team/);
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
