const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Lead Allocate shows stable owner and original creator in separate columns', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadAllocate.jsx'), 'utf8');
  assert.match(source, /Lead Owner \/ Created For/);
  assert.match(source, />Created By</);
  assert.match(source, /Original creator/);
});

test('management Sales MIS groups lead owners by Sales and Operations teams in UI and PDF', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx'), 'utf8');
  const exportsSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/productivityReportExports.js'), 'utf8');
  assert.match(page, /Sales & Operations Team Performance/);
  assert.match(page, /buildSalesDepartmentGroups/);
  assert.match(page, /Permanent Lead Owner based counts/);
  assert.match(exportsSource, /managementSalesGroups/);
  assert.match(exportsSource, /Sales & Operations Lead Ownership MIS/);
  assert.match(exportsSource, /TEAM TOTAL/);
});
