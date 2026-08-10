const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');

test('Prachi Chavan can price the four explicitly shared Tushar client quotations', () => {
  assert.match(page, /'prachi chavan': new Set/);
  assert.match(page, /sayaji industries limited/);
  assert.match(page, /sd international/);
  assert.match(page, /shree matangi woven sack private limited/);
  assert.match(page, /daily care consumer/);
  assert.match(page, /if \(hasSharedQuotationCompanyAccess\(currentUser, lead\)\) return true/);
});

test('shared quotation pricing access remains scoped by both user and company', () => {
  assert.match(page, /sharedQuotationCompanyAccess\[name\]\?\.has\(company\)/);
  assert.doesNotMatch(page, /currentUser\?\.name.*prachi.*return true/is);
});
