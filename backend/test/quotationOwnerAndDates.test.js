const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');

test('quotation preview and PDF use the linked lead owner instead of a hard-coded sender', () => {
  assert.match(source, /function quotationOwnerName\(quotation = \{\}\)/);
  assert.match(source, /quotation\.leadGeneratedBy/);
  assert.doesNotMatch(source, /<p>Krunal Goda<\/p>/);
});

test('quotation AT/26-27/325 uses its requested view-only sender and preparer names', () => {
  assert.match(source, /quotation\.quotationNumber.*AT\/26-27\/325.*return 'ANAND PADHYA'/);
  assert.match(source, /function quotationPreparedByName\(quotation = \{\}\)/);
  assert.match(source, /quotation\.quotationNumber.*AT\/26-27\/325.*return 'SAURABH BHAT'/);
  assert.equal((source.match(/quotationPreparedByName\(quotation\)/g) || []).length, 2);
});

test('quotation valid-until dates use the same display formatter as quotation dates', () => {
  assert.match(source, /Quotation Valid Until: \{formatDisplayDate\(quotation\.validUntil\)\}/);
  assert.match(source, /Quotation Valid Until: \$\{escapeHtml\(formatDisplayDate\(quotation\.validUntil\)\)\}/);
});
