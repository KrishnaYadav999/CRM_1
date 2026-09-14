const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSalesManagementAggregation,
  formatAggregation,
  parseDateRange
} = require('../src/services/salesManagementDashboard');

test('sales management range validates dates and includes the complete final day', () => {
  const period = parseDateRange('2026-08-01', '2026-08-31');
  assert.equal(period.from, '2026-08-01');
  assert.equal(period.to, '2026-08-31');
  assert.equal(period.start.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(period.end.toISOString(), '2026-08-31T23:59:59.999Z');
  assert.throws(() => parseDateRange('2026-09-01', '2026-08-01'), /on or before/);
});

test('sales aggregation joins users and quotations and facets management metrics', () => {
  const period = parseDateRange('2026-04-01', '2026-09-30');
  const pipeline = buildSalesManagementAggregation(period);
  const serialized = JSON.stringify(pipeline);
  assert.match(serialized, /"from":"users"/);
  assert.match(serialized, /"from":"quotations"/);
  assert.match(serialized, /"\$dateToString"/);
  assert.match(serialized, /"managerPerformance"/);
  assert.match(serialized, /"monthlyTrend"/);
  assert.match(serialized, /"departmentBreakdown"/);
  assert.match(serialized, /poAmount/);
  assert.match(serialized, /poApprovalStatus/);
});

test('dashboard formatting keeps approved quotation value separate from confirmed PO revenue', () => {
  const period = parseDateRange('2026-09-01', '2026-09-30');
  const result = formatAggregation({
    summary: [{ totalLeads: 10, convertedLeads: 2, closedDeals: 3, confirmedRevenue: 125000, approvedQuotationValue: 300000, approvedQuotations: 4 }],
    managerPerformance: [{ _id: 'manager-1', managerName: 'Manager', totalLeads: 10, convertedToSale: 2, closedDeals: 3, confirmedRevenue: 125000, approvedQuotationValue: 300000, conversionRate: 20 }],
    monthlyTrend: [{ _id: '2026-09', totalLeads: 10, converted: 2, conversionRate: 20 }],
    departmentBreakdown: []
  }, period);
  assert.equal(result.summary.confirmedRevenue, 125000);
  assert.equal(result.summary.approvedQuotationValue, 300000);
  assert.equal(result.summary.conversionRate, 20);
  assert.equal(result.managerPerformance[0].status, 'warning');
});
