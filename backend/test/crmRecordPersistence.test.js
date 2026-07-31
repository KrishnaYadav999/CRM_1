const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCompanyIdentity } = require('../src/services/crmRecordPersistence');

test('CRM company identity is stable across legal-name variants', () => {
  assert.equal(
    normalizeCompanyIdentity('Pinnacle Industries Private Limited'),
    normalizeCompanyIdentity('PINNACLE INDUSTRIES PVT LTD')
  );
});

test('CRM company identity normalizes punctuation and ampersands consistently', () => {
  assert.equal(
    normalizeCompanyIdentity('A & B Polymers, Ltd.'),
    normalizeCompanyIdentity('A and B Polymers Limited')
  );
});
