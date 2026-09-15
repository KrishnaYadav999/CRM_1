const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('Sales MIS PDF consolidates Team A and Team B under Operation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/salesManagementExports.js'), 'utf8');
  assert.match(source, /\^team\\s\*\[ab\]\$\/i\.test\(sourceName\) \? 'Operation'/);
  assert.match(source, /pdfDepartmentBreakdown\(data\.departmentBreakdown\)/);
  assert.match(source, /convertedLeads \/ row\.leadCount/);
  assert.match(source, /row\.actual \/ row\.closedDeals/);
});
