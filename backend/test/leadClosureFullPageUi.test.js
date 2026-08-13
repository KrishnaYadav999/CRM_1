const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');

test('lead closure uses a full-screen workspace and creates one PO row per quotation service', () => {
  assert.match(source, /fixed inset-0 z-\[125\] bg-slate-50/);
  assert.match(source, /quotationItems\.length \? quotationItems\.map\(quoteRow\)/);
  assert.match(source, /fetchedPoRows\.map\(\(row, rowIndex\) => \(\{ \.\.\.row, \.\.\.\(savedPoRows\[rowIndex\] \|\| \{\}\) \}\)\)/);
  assert.match(source, /quotation service row/);
});

test('quotation and PO data share one table with combined and individual amount presentation', () => {
  assert.match(source, /'Basic Amount \(INR\)', 'PO Number', 'PO Proof', 'Service'/);
  assert.match(source, /Combined Basic Amount/);
  assert.match(source, /rowSpan=\{combined \? rows\.length : 1\}/);
  assert.match(source, /combined \? updateCombinedAmount/);
});
