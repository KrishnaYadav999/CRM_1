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

test('EPR Credit quotations require KG or MT UOM and normalize it', () => {
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ businessCategory: 'EPR Credit', serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'annual', serviceStartDate: '2026-08-07' }] }),
    /UOM must be KG or MT/
  );
  const body = quotationController._test.cleanBody({ items: [{ businessCategory: 'EPR Credit', unitLabel: 'kg', annualReturnEprCreditYears: ['2024-25'], serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'annual', serviceStartDate: '2026-08-07' }] });
  assert.equal(body.items[0].unit, '1');
  assert.equal(body.items[0].unitLabel, 'KG');
  assert.equal(body.items[0].servicePeriod, 0);
  assert.equal(body.items[0].periodUnit, 'annual');
  assert.equal(body.items[0].serviceStartDate, '');
  assert.equal(body.items[0].serviceEndDate, '');
});

test('EPR Credit accepts the dashed business label and always clears legacy service-period values', () => {
  const body = quotationController._test.cleanBody({ items: [{
    businessCategory: 'EPR - Credit', unitLabel: 'MT', annualReturnEprCreditYears: ['2025-26'],
    serviceCategory: 'EPR - Execution', servicePeriod: 25, periodUnit: 'days', transitionPeriod: 'Yes',
    serviceStartDate: '2026-08-07', serviceEndDate: '2026-09-01'
  }] });
  assert.equal(body.items[0].businessCategory, 'EPR Credit');
  assert.equal(body.items[0].servicePeriod, 0);
  assert.equal(body.items[0].periodUnit, 'annual');
  assert.equal(body.items[0].transitionPeriod, 'No');
  assert.equal(body.items[0].serviceStartDate, '');
  assert.equal(body.items[0].serviceEndDate, '');
});

test('EPR Credit years are required, validated, persisted, and cleared for consultancy items', () => {
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ businessCategory: 'EPR Credit', unitLabel: 'MT', serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'annual', serviceStartDate: '2026-08-07' }] }),
    /select at least one Annual Return EPR Credit Year/
  );
  assert.throws(
    () => quotationController._test.cleanBody({ items: [{ businessCategory: 'EPR Credit', unitLabel: 'MT', annualReturnEprCreditYears: ['2030-31'], serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'annual', serviceStartDate: '2026-08-07' }] }),
    /unsupported financial year/
  );
  const credit = quotationController._test.cleanBody({ items: [{ businessCategory: 'EPR Credit', unitLabel: 'MT', annualReturnEprCreditYears: ['2025-26', '2024-25', '2025-26'], applicantType: 'Recycler', serviceCategory: 'EPR - Used Oil', servicePeriod: 1, periodUnit: 'annual', serviceStartDate: '2026-08-07' }] });
  assert.deepEqual(credit.items[0].annualReturnEprCreditYears, ['2025-26', '2024-25']);
  assert.equal(credit.items[0].applicantType, 'Recycler');
  const consultancy = quotationController._test.cleanBody({ items: [{ businessCategory: 'EPR Consultancy', annualReturnEprCreditYears: ['2024-25'], serviceCategory: 'EPR - Execution', servicePeriod: 1, periodUnit: 'annual', serviceStartDate: '2026-08-07' }] });
  assert.deepEqual(consultancy.items[0].annualReturnEprCreditYears, []);
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

test('period controls appear in the mapping popup and not in the main quotation table', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(page, /'Service Period', 'Select Period', 'Transition Period', \.\.\.\(financialYearNeedsEprData \? \['Annual Return EPR Year'\]/);
  assert.match(page, /'Annual Return EPR Year'\]\s*:\s*\[\]\), \.\.\.\(financialYearNeedsEprCreditYears \? \['Annual Return EPR Credit Years'\]/);
  assert.match(page, /'Annual Return EPR Credit Years'\]\s*:\s*\[\]\), 'Applicant Type', 'Service Category', 'Business Category'/);
  assert.match(page, /financialYearDraft\.transitionPeriod \|\| 'No'.*TRANSITION_PERIOD_OPTIONS/s);
  assert.doesNotMatch(page, /'EPR \/ Service Period', 'Select Period', 'Transition Period', 'Industry Type'/);
  assert.match(page, /periodDisplay\(financialYearDraft\.servicePeriod, financialYearDraft\.periodUnit\)/);
});

test('EPR Credit period controls are disabled and validity notes use business category and quotation validity', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(page, /disabled=\{financialYearNeedsEprCreditYears\}/);
  assert.match(page, /financialYearNeedsEprCreditYears \? 'N\/A'/);
  assert.match(page, /The EPR – Credit rates are valid till:/);
  assert.match(page, /servicePeriodValidityNote\(financialYearDraft, quotation\.validUntil\)/);
  assert.match(page, /item\.businessCategory \? ` for \$\{item\.businessCategory\}`/);
  assert.doesNotMatch(page, /item\.serviceCategory \? ` for \$\{item\.serviceCategory\}`/);
});

test('quotation UI shares applicant fallback logic and conditionally renders EPR Credit years', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  const model = fs.readFileSync(path.resolve(__dirname, '../src/models/Quotation.js'), 'utf8');
  assert.match(page, /function getQuotationApplicantType\(item = \{\}, source = \{\}\)/);
  assert.match(page, /source\.subApplicantType \|\| source\.piboCategory \|\| item\.subApplicantType \|\| item\.piboCategory \|\| source\.applicantType/);
  assert.match(page, /financialYearNeedsEprCreditYears && <td[^>]*><QuoteYearMultiSelect/);
  assert.match(page, /Please select at least one Annual Return EPR Credit Year/);
  assert.match(page, /getQuotationApplicantType\(financialYearDraft\)/);
  assert.match(page, /quotationEprCreditYears\(item\)\.join\(', '\)/);
  assert.match(model, /annualReturnEprCreditYears:[\s\S]*2022-23[\s\S]*2029-30/);
  assert.match(model, /applicantType: \{ type: String/);
  assert.match(model, /subApplicantType: \{ type: String/);
});

test('quotation views and printable tables omit period-unit and transition columns', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.doesNotMatch(page, /'Business Category', 'Service Category', 'Service Period', 'Select Period', 'Transition Period'/);
  assert.doesNotMatch(page, /<th[^>]*>Select Period<\/th>/);
  assert.doesNotMatch(page, /<th[^>]*>Transition Period<\/th>/);
  assert.doesNotMatch(page, /QuoteModalStat label="(?:Select Period|Transition Period)"/);
  assert.doesNotMatch(page, /\['Select Period', periodUnitLongLabel/);
});

test('quotation PDF places applicant beside the date range and combines annual and credit year mapping', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(page, /function quotationServiceDateRange\(item = \{\}\)/);
  assert.match(page, /return `\$\{formatServiceDate\(startDate\)\} - \$\{formatServiceDate\(endDate\)\}`/);
  assert.match(page, /'Service Period', 'Applicant Type', 'Services Offered', 'Unit'/);
  assert.match(page, /<td[^>]*>\{quotationServiceDateRange\(item\)\}<\/td>\s*<td[^>]*>\{getQuotationApplicantType\(item\)\}<\/td>/);
  assert.match(page, /Annual Return EPR Year \/ Credit Year/);
  assert.match(page, /quotationAnnualReturnOrCreditYears\(item\)\.join\(', '\)/);
  assert.doesNotMatch(page, /EPR \/ Service Period<\/th><th[^>]*>Applicant Type/);
  assert.match(page, /const ANANT_TATTVA_GST_NUMBER = '27AAZCA6657R1ZB'/);
});

test('quotation selects safely normalize object and string options before filtering', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(page, /option && typeof option === 'object'/);
  assert.match(page, /`\$\{option\.label\} \$\{option\.value\}`\.toLowerCase\(\)/);
  assert.doesNotMatch(page, /options\.filter\(\(option\) => option\.toLowerCase\(\)/);
});
