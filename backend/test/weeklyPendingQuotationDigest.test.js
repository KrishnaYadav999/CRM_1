const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __test } = require('../src/services/weeklyPendingQuotationDigest');

test('weekly Super Admin email contains the complete pending quotation table and summary', () => {
  const rows = [
    { quotationNumber: 'AT/26-27/375', companyName: 'ABC & Recyclers', createdBy: 'CRM User', quotationDate: '2026-09-16', service: 'EPR - Plastic Waste', category: 'Plastic Waste', amount: 65000, pendingDays: 3 },
    { quotationNumber: 'AT/26-27/376', companyName: 'Second Company', createdBy: 'Sales User', quotationDate: '2026-09-17', service: 'Annual Return', category: 'EPR', amount: 35000, pendingDays: 2 }
  ];
  const html = __test.buildWeeklyPendingQuotationEmail({ rows, recipientName: 'Super Admin', weekEnding: '2026-09-19' });

  assert.match(html, /Weekly Pending Quotation Approval Report/);
  assert.match(html, /Still Pending/);
  assert.match(html, /Pending Value/);
  assert.match(html, /AT\/26-27\/375/);
  assert.match(html, /AT\/26-27\/376/);
  assert.match(html, /ABC &amp; Recyclers/);
  assert.match(html, /Pending For/);
  assert.match(html, /complete list/i);
});

test('weekly digest calculates pending age and hydrates current quotation values', () => {
  const now = new Date('2026-09-19T12:30:00.000Z');
  const records = [{
    _id: 'approval-1', sourceClientId: 'quotation-1', uniqueId: 'OLD', clientName: 'Old Company',
    createdByName: 'Creator', createdAt: new Date('2026-09-12T12:30:00.000Z'), payload: { basicAmount: 100 }
  }];
  const quotations = [{
    _id: 'quotation-1', quotationNumber: 'AT/26-27/400', companyName: 'Current Company',
    quotationDate: '2026-09-18', grandTotal: 75000, status: 'admin_approved', items: [{ serviceCategory: 'EPR', eprCategory: 'Plastic' }]
  }];
  const rows = __test.normalizeDigestRows(records, quotations, now);

  assert.equal(rows[0].quotationNumber, 'AT/26-27/400');
  assert.equal(rows[0].companyName, 'Current Company');
  assert.equal(rows[0].amount, 75000);
  assert.equal(rows[0].pendingDays, 7);
});

test('weekly digest recovers unindexed pending quotations and excludes stale terminal rows', () => {
  const now = new Date('2026-09-19T12:30:00.000Z');
  const records = [
    { _id: 'stale', sourceClientId: 'approved-1', uniqueId: 'STALE', createdAt: '2026-09-10' }
  ];
  const quotations = [
    { _id: 'approved-1', quotationNumber: 'APPROVED', status: 'approved', createdAt: '2026-09-10' },
    { _id: 'missing-index-1', quotationNumber: 'AT/26-27/401', companyName: 'Recovered Company', status: 'admin_approved', grandTotal: 90000, createdAt: '2026-09-18' }
  ];
  const rows = __test.normalizeDigestRows(records, quotations, now);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].quotationNumber, 'AT/26-27/401');
  assert.equal(rows[0].companyName, 'Recovered Company');
});

test('weekly digest keeps Saturday and retry Sunday in the same idempotency week', () => {
  assert.equal(__test.indiaWeekKey(new Date('2026-09-19T12:30:00.000Z')), '2026-W38');
  assert.equal(__test.indiaWeekKey(new Date('2026-09-20T12:30:00.000Z')), '2026-W38');
});

test('Vercel runs the protected weekly digest at Saturday 6 PM IST', () => {
  const root = path.resolve(__dirname, '../..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const index = fs.readFileSync(path.join(root, 'backend/src/index.js'), 'utf8');
  const cron = config.crons.find((item) => item.path === '/api/internal/weekly-pending-quotation-digest');

  assert.deepEqual(cron, { path: '/api/internal/weekly-pending-quotation-digest', schedule: '30 12 * * 6' });
  assert.match(index, /weekly-pending-quotation-digest/);
  assert.match(index, /authorization !== `Bearer \$\{cronSecret\}`/);
  assert.match(index, /runWeeklyPendingQuotationDigest/);
});
