const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const utilitySource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/leadClosureQuotation.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(utilitySource).toString('base64')}`);

const producerService = {
  assignedServiceId: 'service-producer-2026',
  eprCategory: 'EPR - Plastic Waste',
  businessCategory: 'EPR Consultancy',
  applicantType: 'PIBO',
  piboCategory: 'Producer (Small & Micro)',
  servicesOffered: 'Annual Return Filling',
  firstAnnualReturnYearApplicable: '2026-27'
};

test('lead closure selects the quotation containing the exact clicked service instead of the latest quotation', async () => {
  const { selectLeadClosureQuotation } = await modulePromise;
  const result = selectLeadClosureQuotation([
    {
      quotationNumber: 'AT/26-27/360',
      updatedAt: '2026-09-22T10:00:00.000Z',
      items: [{ assignedServiceId: 'service-importer-2026', sourceServiceIndex: 5, applicantType: 'PIBO', piboCategory: 'Importer of Raw Material', servicesOffered: 'Annual Return Filling', servicesForYear: '2026-27' }]
    },
    {
      quotationNumber: 'AT/26-27/321',
      updatedAt: '2026-08-12T10:00:00.000Z',
      items: [{ ...producerService, sourceServiceIndex: 1, servicesForYear: '2026-27', basicAmount: 25000 }]
    }
  ], { service: producerService, assignment: { assignedServiceId: 'service-producer-2026' }, serviceIndex: 1 });

  assert.equal(result.quotation.quotationNumber, 'AT/26-27/321');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].piboCategory, 'Producer (Small & Micro)');
  assert.equal(result.matchType, 'assigned-service-id');
});

test('legacy quotation matching keeps Producer and Importer services isolated', async () => {
  const { selectLeadClosureQuotation } = await modulePromise;
  const result = selectLeadClosureQuotation([
    {
      quotationNumber: 'IMPORTER-LATEST',
      updatedAt: '2026-09-22T10:00:00.000Z',
      items: [{ sourceServiceIndex: 1, piboCategory: 'Importer of Raw Material', eprCategory: 'EPR - Plastic Waste', servicesOffered: 'Annual Return Filling', servicesForYear: '2026-27' }]
    },
    {
      quotationNumber: 'PRODUCER-OLDER',
      updatedAt: '2026-08-12T10:00:00.000Z',
      items: [{ sourceServiceIndex: 1, piboCategory: 'Producer (Small & Micro)', eprCategory: 'EPR - Plastic Waste', servicesOffered: 'Annual Return Filling', servicesForYear: '2026-27' }]
    }
  ], { service: { ...producerService, assignedServiceId: '' }, serviceIndex: 1 });

  assert.equal(result.quotation.quotationNumber, 'PRODUCER-OLDER');
  assert.equal(result.items[0].piboCategory, 'Producer (Small & Micro)');
  assert.equal(result.matchType, 'legacy-identity-and-index');
});

test('lead closure returns no quotation when only an unrelated applicant type exists', async () => {
  const { selectLeadClosureQuotation } = await modulePromise;
  const result = selectLeadClosureQuotation([{
    quotationNumber: 'IMPORTER-ONLY',
    items: [{ sourceServiceIndex: 1, piboCategory: 'Importer of Raw Material', eprCategory: 'EPR - Plastic Waste', servicesOffered: 'Annual Return Filling', servicesForYear: '2026-27' }]
  }], { service: producerService, serviceIndex: 1 });

  assert.equal(result.quotation, null);
  assert.deepEqual(result.items, []);
});

test('Lead Generation no longer falls back to an unrelated quotation item at the same array index', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
  assert.match(page, /selectLeadClosureQuotation\(relevantQuotations/);
  assert.doesNotMatch(page, /allQuotationItems\[index\]/);
});
