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

test('quotation valid-until dates use the same display formatter as quotation dates', () => {
  assert.match(source, /Quotation Valid Until: \{formatDisplayDate\(quotation\.validUntil\)\}/);
  assert.match(source, /Quotation Valid Until: \$\{escapeHtml\(formatDisplayDate\(quotation\.validUntil\)\)\}/);
});
