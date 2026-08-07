const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const quotationController = require('../src/controllers/quotationController');
const {
  renewalDateFrom,
  serviceEndDateFrom
} = require('../src/utils/servicePeriod');

test('service period date calculations support days, calendar months, and annual periods', () => {
  assert.equal(serviceEndDateFrom('2026-08-07', 10, 'days'), '2026-08-16');
  assert.equal(renewalDateFrom('2026-08-07', 10, 'days'), '2026-08-17');
  assert.equal(serviceEndDateFrom('2026-08-07', 3, 'months'), '2026-11-06');
  assert.equal(renewalDateFrom('2026-08-07', 3, 'months'), '2026-11-07');
  assert.equal(serviceEndDateFrom('2026-08-07', 1, 'annual'), '2027-08-06');
  assert.equal(renewalDateFrom('2026-08-07', 1, 'annual'), '2027-08-07');
  assert.equal(serviceEndDateFrom('2026-08-07', 2, 'annual'), '2028-08-06');
  assert.equal(renewalDateFrom('2026-08-07', 2, 'annual'), '2028-08-07');
});

test('calendar period calculations clamp month-end and leap-day renewals', () => {
  assert.equal(renewalDateFrom('2027-01-31', 1, 'months'), '2027-02-28');
  assert.equal(serviceEndDateFrom('2027-01-31', 1, 'months'), '2027-02-27');
  assert.equal(renewalDateFrom('2024-02-29', 1, 'annual'), '2025-02-28');
  assert.equal(serviceEndDateFrom('2024-02-29', 1, 'annual'), '2025-02-27');
});

test('legacy quotation items without a period unit remain annual', () => {
  const legacyItems = [{ serviceCategory: 'EPR - Execution', servicePeriod: 1, serviceStartDate: '2026-08-07' }];
  const body = quotationController._test.cleanBody({
    items: legacyItems
  }, null, legacyItems);
  assert.equal(body.items[0].periodUnit, 'annual');
  assert.equal(body.items[0].serviceEndDate, '2027-08-06');
});

test('quotation API sanitization rejects invalid units and non-integer periods', () => {
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ serviceCategory: 'EPR - Execution', servicePeriod: 1, serviceStartDate: '2026-08-07' }] }),
    /Select Period must be Days, Month, or Annual/
  );
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'weeks', serviceStartDate: '2026-08-07' }] }),
    /Select Period must be Days, Month, or Annual/
  );
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ serviceCategory: 'EPR - Execution', servicePeriod: 1.5, periodUnit: 'months', serviceStartDate: '2026-08-07' }] }),
    /whole number/
  );
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'annual', transitionPeriod: 'Maybe', serviceStartDate: '2026-08-07' }] }),
    /Transition Period must be Yes or No/
  );
});

test('transition dates are system-derived and frozen against update payloads', () => {
  const existing = [{
    id: 'service-1', serviceCategory: 'EPR - Plastic Waste', servicePeriod: 1, periodUnit: 'annual',
    transitionPeriod: 'Yes', serviceStartDate: '2026-04-01', serviceEndDate: '2027-03-31'
  }];
  const body = quotationController._test.cleanBody({
    items: [{
      ...existing[0], serviceStartDate: '2030-01-01', serviceEndDate: '2035-01-01'
    }]
  }, null, existing);
  assert.equal(body.items[0].serviceStartDate, '2026-04-01');
  assert.equal(body.items[0].serviceEndDate, '2027-03-31');

  const created = quotationController._test.cleanBody({
    items: [{
      serviceCategory: 'EPR - Plastic Waste', servicePeriod: 1, periodUnit: 'annual', transitionPeriod: 'Yes',
      annualReturnYears: ['2026-27'], serviceStartDate: '2030-01-01', serviceEndDate: '2035-01-01'
    }]
  });
  assert.equal(created.items[0].serviceStartDate, '2026-04-01');
  assert.equal(created.items[0].serviceEndDate, '2027-03-31');

  const autoStarted = quotationController._test.cleanBody({
    quotationDate: '2026-08-07',
    items: [{ serviceCategory: 'EPR - Execution', servicePeriod: 3, periodUnit: 'months', transitionPeriod: 'Yes' }]
  });
  assert.equal(autoStarted.items[0].serviceStartDate, '2026-08-07');
  assert.equal(autoStarted.items[0].serviceEndDate, '2026-11-06');
});

test('both quotation mapping popups expose Select Period in the requested column order', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(page, /'Service Period', 'Select Period', \.\.\.\(financialYearNeedsEprData \? \['Annual Return EPR Year'\]/);
  assert.match(page, /'Annual Return EPR Year'\]\s*:\s*\[\]\), 'Service Category', 'Business Category'/);
  assert.doesNotMatch(page, /'Service Period', 'Select Period', 'Transition Period', \.\.\.\(financialYearNeedsEprData/);
  assert.match(page, /periodDisplay\(financialYearDraft\.servicePeriod, financialYearDraft\.periodUnit\)/);
});

test('quotation selects safely normalize object and string options before filtering', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(page, /option && typeof option === 'object'/);
  assert.match(page, /`\$\{option\.label\} \$\{option\.value\}`\.toLowerCase\(\)/);
  assert.doesNotMatch(page, /options\.filter\(\(option\) => option\.toLowerCase\(\)/);
});
