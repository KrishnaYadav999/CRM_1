const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');

test('quotation preview and PDF use the linked lead owner instead of a hard-coded sender', () => {
  assert.match(source, /function quotationOwnerName\(quotation = \{\}\)/);
  assert.match(source, /quotation\.fromName/);
  assert.match(source, /quotation\.leadGeneratedBy/);
  assert.doesNotMatch(source, /<p>Krunal Goda<\/p>/);
});

test('lead selection asks for and persists quotation From and Prepared By names', () => {
  const model = fs.readFileSync(path.resolve(__dirname, '../src/models/Quotation.js'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/quotationController.js'), 'utf8');
  assert.match(source, /function requestLeadSelection\(leadId\)/);
  assert.match(source, /From Name and Prepared By Name are required/);
  assert.match(source, /These names will appear in the quotation preview and downloaded PDF/);
  assert.match(source, /preparedByName: String\(identity\?\.preparedByName/);
  assert.match(model, /fromName: \{ type: String/);
  assert.match(model, /preparedByName: \{ type: String/);
  assert.match(controller, /fromName: cleanString\(body\.fromName\)/);
  assert.match(controller, /preparedByName: cleanString\(body\.preparedByName\)/);
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
