const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSalesManagementAggregation,
  formatAggregation,
  formatMonthlyCarryForward,
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

test('monthly carry-forward treats the migration batch as opening backlog and later leads as new', () => {
  const period = parseDateRange('2026-08-01', '2026-09-30');
  const rows = [
    ...Array.from({ length: 120 }, (_, index) => ({
      createdAt: new Date(`2026-08-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`),
      closureDate: index < 20 ? new Date('2026-08-25T08:00:00.000Z') : null,
      legacyBacklog: true
    })),
    ...Array.from({ length: 50 }, (_, index) => ({
      createdAt: new Date(`2026-09-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`),
      closureDate: null
    }))
  ];
  const result = formatMonthlyCarryForward(rows, period);
  assert.deepEqual(result[0], {
    month: '2026-08', openingPending: 120, newLeads: 0, totalAvailable: 120,
    closedFromOpening: 20, closedFromNew: 0, closedThisMonth: 20, closingPending: 100
  });
  assert.deepEqual(result[1], {
    month: '2026-09', openingPending: 100, newLeads: 50, totalAvailable: 150,
    closedFromOpening: 0, closedFromNew: 0, closedThisMonth: 0, closingPending: 150
  });
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
  assert.match(serialized, /quotationBasicAmount/);
  assert.match(serialized, /oldBusinessPoValue/);
  assert.match(serialized, /newBusinessQuotationValue/);
  assert.match(serialized, /oldLeads/);
  assert.match(serialized, /newLeads/);
  assert.match(serialized, /"_id":"\$dashboardOwnerId"/);
  assert.match(serialized, /"reportingManagerName"/);
  assert.match(serialized, /"owner\.isActive":\{"\$ne":false\}/);
});

test('dashboard formatting keeps approved quotation value separate from confirmed PO revenue', () => {
  const period = parseDateRange('2026-09-01', '2026-09-30');
  const result = formatAggregation({
    summary: [{ totalLeads: 10, oldLeads: 6, newLeads: 4, convertedLeads: 2, closedDeals: 3, confirmedRevenue: 125000, approvedQuotationValue: 300000, approvedQuotations: 4, oldBusinessLeads: 1, oldBusinessPoValue: 25000, newBusinessLeads: 1, newBusinessQuotationValue: 110000, newBusinessPoValue: 100000 }],
    managerPerformance: [{ _id: 'owner-1', leadOwnerName: 'Lead Owner', reportingManagerId: 'manager-1', reportingManagerName: 'Manager', totalLeads: 10, oldLeads: 6, newLeads: 4, convertedToSale: 2, closedDeals: 3, confirmedRevenue: 125000, approvedQuotationValue: 300000, conversionRate: 20, oldBusinessLeads: 1, oldBusinessPoValue: 25000, newBusinessLeads: 1, newBusinessQuotationValue: 110000, newBusinessPoValue: 100000 }],
    monthlyTrend: [{ _id: '2026-09', totalLeads: 10, converted: 2, conversionRate: 20 }],
    departmentBreakdown: []
  }, period);
  assert.equal(result.summary.confirmedRevenue, 125000);
  assert.equal(result.summary.oldLeads, 6);
  assert.equal(result.summary.newLeads, 4);
  assert.equal(result.summary.approvedQuotationValue, 300000);
  assert.equal(result.summary.oldBusinessLeads, 1);
  assert.equal(result.summary.oldBusinessPoValue, 25000);
  assert.equal(result.summary.newBusinessLeads, 1);
  assert.equal(result.summary.newBusinessQuotationValue, 110000);
  assert.equal(result.summary.newBusinessPoValue, 100000);
  assert.equal(result.summary.conversionRate, 20);
  assert.equal(result.managerPerformance[0].leadOwnerName, 'Lead Owner');
  assert.equal(result.managerPerformance[0].reportingManagerName, 'Manager');
  assert.equal(result.managerPerformance[0].oldLeads + result.managerPerformance[0].newLeads, result.managerPerformance[0].totalLeads);
  assert.equal(result.managerPerformance[0].status, 'warning');
});
