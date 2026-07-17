const test = require('node:test');
const assert = require('node:assert/strict');
const ccpRouter = require('../src/routes/ccp');
const { nonEmptyQuery, ccpApiHeaders } = ccpRouter._test;

test('CCP history query removes empty identifiers', () => {
  assert.deepEqual(nonEmptyQuery({ leadCode: ' ATPL-LEAD-0001 ', company: '', unused: null }), { leadCode: 'ATPL-LEAD-0001' });
});

test('CCP history query preserves linked lead identifiers', () => {
  assert.deepEqual(nonEmptyQuery({ leadCode: 'ATPL-LEAD-0001', company: '20 MICRONS LIMITED' }), { leadCode: 'ATPL-LEAD-0001', company: '20 MICRONS LIMITED' });
});

test('CCP API key stays in server-side headers', () => {
  const previous = process.env.CCP_SHARED_API_KEY;
  process.env.CCP_SHARED_API_KEY = 'test-shared-key';
  assert.equal(ccpApiHeaders()['x-ccp-api-key'], 'test-shared-key');
  if (previous === undefined) delete process.env.CCP_SHARED_API_KEY;
  else process.env.CCP_SHARED_API_KEY = previous;
});

test('quotation-only helper documents are excluded from CCP client rows', () => {
  const { isQuotationOnlyClientRecord, cleanCcpRowsForCrm } = ccpRouter._test;
  const helper = { data: { basic: { clientLegalName: 'Example' }, quotation: { quotationNumber: 'Q-1' } } };
  const complete = { data: { basic: { clientLegalName: 'Example', tradeName: 'Example' }, importMeta: { uniqueId: 'ATPL-1' }, quotation: { quotationNumber: 'Q-1' } } };
  assert.equal(isQuotationOnlyClientRecord(helper), true);
  assert.equal(isQuotationOnlyClientRecord(complete), false);
  assert.deepEqual(cleanCcpRowsForCrm([helper, complete], 'clients'), [complete]);
});
