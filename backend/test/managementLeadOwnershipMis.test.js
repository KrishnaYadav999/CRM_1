const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Lead Allocate shows stable owner and editable creator in separate columns', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadAllocate.jsx'), 'utf8');
  assert.match(source, /Lead Owner \/ Created For/);
  assert.match(source, /Edit Created By/);
  assert.match(source, /creatorName/);
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
  assert.match(page, /Management Lead Ownership/);
  assert.match(page, /group\.name === 'Management'/);
  assert.match(exportsSource, /'Sales Team', 'Operations Team', 'Management', 'Other Departments'/);
});

test('Lead Allocate can edit Created By without reallocating the stable owner', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadAllocate.jsx'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/leads.js'), 'utf8');
  assert.match(page, /Edit Created By/);
  assert.match(page, /API_ENDPOINTS\.leads\.creator/);
  assert.match(controller, /exports\.updateLeadCreator/);
  assert.match(controller, /creatorChangeHistory\.push/);
  assert.match(controller, /Lead Owner was not changed/);
  assert.match(routes, /\/:id\/creator/);
});
