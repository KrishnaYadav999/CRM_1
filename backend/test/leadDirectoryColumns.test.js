const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
const start = source.indexOf('function LeadDirectoryView');
const end = source.indexOf('function MetricOutputCard', start);
const directory = source.slice(start, end);

test('lead directory omits Applicant Type while preserving the service column and table alignment', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(directory, /\['Lead ID', 'w-\[140px\]'\], \['Company', 'w-\[170px\]'\], \['Service Category'/);
  assert.doesNotMatch(directory, /\['Applicant Type', 'w-\[120px\]'\]/);
  assert.doesNotMatch(directory, /\{item\.piboCategory \|\| '-'\}/);
  assert.match(directory, /colSpan=\{11\}/);
});
