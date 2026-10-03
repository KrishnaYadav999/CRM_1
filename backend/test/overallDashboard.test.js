const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOverall, normalizeYear } = require('../src/services/overallDashboard');
const { loadPurchaseOrders } = require('../src/controllers/purchaseOrderController');
const row = (clientName, financialYear, service, extra = {}) => ({ clientName, financialYear, subApplicantType: 'Producer', applicantType: 'PIBO', isClosed: true, services: [{ name: service }], ...extra });

test('yearly matrices start at 2025, fill gaps and expose only closed services for each FY', () => {
  const result = buildOverall([
    row('Older client', '2024-25', 'Account Closure'),
    row('CCL', '2025-26', 'New Registration', { leadNumber: 'CL-100' }),
    row('CCL', '2025-26', 'Consulting', { subApplicantType: 'Importer of Raw Material', leadNumber: 'CL-101' }),
    row('CCL', '2025-26', 'Category 1 – EOL', { isClosed: false }),
    row('20 Micron', '2027-28', 'Annual Filling'),
    row('20 Micron', '2027-28', 'CTE & CTO/CCA Expansion')
  ]);
  assert.deepEqual(result.yearOptions, ['2025-26', '2026-27', '2027-28']);
  const [first, gap, last] = result.yearSections;
  assert.deepEqual(first.services, ['New Registration', 'Consulting']);
  assert.equal(first.clients.length, 1);
  assert.deepEqual(first.clients[0].references, ['CL-100', 'CL-101']);
  assert.ok(first.clients[0].types.includes('Importer of Raw Material'));
  assert.equal(first.groups.find((group) => group.type === 'Producer').count, 1);
  assert.equal(first.groups.find((group) => group.type === 'Importer of Raw Material').count, 1);
  assert.equal(gap.summary.clients, 0);
  assert.deepEqual(gap.services, []);
  assert.deepEqual(last.services, ['Annual Filling', 'CTE & CTO/CCA Expansion']);
  assert.equal(result.portfolioSummary.clients, 2);
  assert.equal(result.portfolioSummary.services, 4);
});

test('client export includes the complete FY list and binary closed-service columns', async () => {
  const { buildClientExportRows } = await import('../../frontend/src/utils/overallDashboardExports.mjs');
  const records = Array.from({ length: 25 }, (_, index) => row(`Client ${index}`, '2025-26', 'Consulting'));
  records.push(row('Client 0', '2025-26', 'New Registration'));
  const section = buildOverall(records, [{ companyKey: 'client 0', status: 'INACTIVE' }]).yearSections[0];
  const exported = buildClientExportRows(section.clients, section.year, section.services);
  assert.equal(exported.length, 25);
  const client = exported.find((entry) => entry.Client === 'Client 0');
  assert.equal(client.Status, 'Inactive');
  assert.equal(client['Financial Year'], '2025-26');
  assert.equal(client['New Registration'], 1);
  assert.equal(exported.find((entry) => entry.Client === 'Client 1')['New Registration'], 0);
  assert.ok(!Object.hasOwn(client, 'Category 1 – EOL'));
});

test('deduplicates companies and services per FY and includes only the two closed services', () => {
  const result = buildOverall([
    row('CCL', '2026-27', 'New Registration'), row('CCL', '2026-27', 'Consulting'), row('CCL', '2026-27', 'Consulting'),
    row('CCL', '2026-27', 'Account Closure', { isClosed: false }), row('CCL', '2026-27', 'Name Change Application – GPCB', { isClosed: false }),
    row('20 Micron', '2026-27', 'Consulting'), row('20 Micron', '2027-28', 'New Registration')
  ], [], '2026-27');
  assert.equal(result.summary.clients, 2);
  assert.equal(result.trends.find((entry) => entry.year === '2027-28').clients, 1);
  const group = result.groups.find((entry) => entry.type === 'Producer');
  assert.equal(group.count, 2);
  assert.equal(group.services.Consulting, 2);
  const ccl = group.clients.find((entry) => entry.name === 'CCL');
  assert.equal(ccl.services['New Registration'], 1);
  assert.equal(ccl.services['Account Closure'], undefined);
  assert.equal(ccl.services['Name Change Application – GPCB'], undefined);
});
test('inactive clients stay in historical FY totals and pending/rejected requests remain active', () => {
  const result = buildOverall([row('CCL', '2026-27', 'Consulting'), row('20 Micron', '2026-27', 'Consulting')], [{ companyKey: 'ccl', status: 'INACTIVE' }, { companyKey: '20 micron', status: 'ADMIN_PENDING' }]);
  assert.deepEqual(result.trends, [{ year: '2025-26', clients: 0, active: 0, inactive: 0 }, { year: '2026-27', clients: 2, active: 1, inactive: 1 }]);
});
test('validates financial years and gives zero counts for an empty selected year', () => {
  assert.equal(normalizeYear('2026-2027'), '2026-27');
  assert.equal(normalizeYear('2027-26'), '');
  const result = buildOverall([row('CCL', '2026-27', 'Consulting')], [], '2028-29');
  assert.equal(result.summary.clients, 0);
  assert.ok(result.groups.every((group) => group.count === 0));
  assert.equal(result.services.length, 0);
});
test('PO loader uses service-level closure and never inherits another service closure', async () => {
  const model = (rows) => ({ find: () => ({ lean: async () => rows }) });
  const records = await loadPurchaseOrders({
    Lead: model([{ _id: 'lead', company: 'CCL', closedAt: new Date(), serviceSelections: [{ servicesOffered: 'Consulting' }, { servicesOffered: 'Account Closure' }], assignments: [{ closedAt: new Date(), poYearRows: [{ fy: '2026-27', poNumber: 'one' }] }, { poYearRows: [{ fy: '2026-27', poNumber: 'two' }] }] }]),
    Client: model([]), Quotation: model([])
  });
  assert.equal(records[0].isClosed, true);
  assert.equal(records[1].isClosed, false);
  const result = buildOverall(records);
  assert.equal(result.groups.find((group) => group.type === 'Not specified').clients[0].services['Account Closure'], undefined);
});
