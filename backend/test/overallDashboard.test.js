const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOverall, normalizeYear } = require('../src/services/overallDashboard');
const { loadPurchaseOrders } = require('../src/controllers/purchaseOrderController');
const row = (clientName, financialYear, service, extra = {}) => ({ clientName, financialYear, subApplicantType: 'Producer', applicantType: 'PIBO', isClosed: true, services: [{ name: service }], ...extra });

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
  assert.equal(ccl.services['Account Closure'], 0);
  assert.equal(ccl.services['Name Change Application – GPCB'], 0);
});
test('inactive clients stay in historical FY totals and pending/rejected requests remain active', () => {
  const result = buildOverall([row('CCL', '2026-27', 'Consulting'), row('20 Micron', '2026-27', 'Consulting')], [{ companyKey: 'ccl', status: 'INACTIVE' }, { companyKey: '20 micron', status: 'ADMIN_PENDING' }]);
  assert.deepEqual(result.trends, [{ year: '2026-27', clients: 2, active: 1, inactive: 1 }]);
});
test('validates financial years and gives zero counts for an empty selected year', () => {
  assert.equal(normalizeYear('2026-2027'), '2026-27');
  assert.equal(normalizeYear('2027-26'), '');
  const result = buildOverall([row('CCL', '2026-27', 'Consulting')], [], '2028-29');
  assert.equal(result.summary.clients, 0);
  assert.ok(result.groups.every((group) => group.count === 0));
  assert.equal(result.services.filter((service) => service === 'New Registration').length, 1);
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
  assert.equal(result.groups.find((group) => group.type === 'Not specified').clients[0].services['Account Closure'], 0);
});
