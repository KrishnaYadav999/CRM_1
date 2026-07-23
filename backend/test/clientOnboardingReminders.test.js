const test = require('node:test');
const assert = require('node:assert/strict');
const { completeness, hasBasicInfo, buildCsv } = require('../src/services/clientOnboardingReminders');

test('manual reminder starts only after basic info has a value', () => {
  assert.equal(hasBasicInfo({ basic: {} }), false);
  assert.equal(hasBasicInfo({ basic: { tradeName: 'Example' } }), true);
});

test('client completeness reports filled and missing fields', () => {
  const result = completeness({ basic: { clientLegalName: 'Example' }, otp: { mobile: '9999999999' } });
  assert.equal(result.filledCount, 2);
  assert.equal(result.completed, false);
  assert.ok(result.missingFields.includes('Trade Name'));
});

test('CSV report contains every due client row', () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ uniqueId: `ATPL-${index + 1}`, clientName: `Client ${index + 1}`, filledCount: 1, totalCount: 15, missingFields: ['Trade Name'], firstBasicInfoAt: new Date('2026-01-01'), lastSavedAt: new Date('2026-01-02') }));
  const csv = buildCsv(rows);
  assert.equal(csv.split('\n').length, 101);
  assert.match(csv, /ATPL-100/);
});
