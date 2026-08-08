const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx'), 'utf8');

test('super admin dashboard uses live overview and audit data with date filters', () => {
  assert.match(page, /API_ENDPOINTS\.auth\.userProductivityReport/);
  assert.match(page, /params: \{ from: appliedFilters\.from, to: appliedFilters\.to \}/);
  assert.match(page, /timeZone: 'Asia\/Kolkata'/);
});

test('super admin dashboard exposes productivity, risk, reporting, and user-management actions', () => {
  assert.match(page, /Never logged in/);
  assert.match(page, /High away ratio/);
  assert.match(page, /Inactive accounts/);
  assert.match(page, /REPORT_TITLE/);
  assert.match(page, /Support Tickets Raised/);
  assert.match(page, /Generating PDF\.\.\./);
  assert.match(page, /Export Excel/);
  assert.match(page, /Apply Filters/);
  assert.match(page, /Open User Management/);
  assert.match(page, /navigate\('\/dashboard\/users'\)/);
  assert.match(page, /Daily timeline/);
  assert.match(page, /Recent CRM actions/);
  assert.match(page, /Latest access/);
});

test('professional exports share the filtered report rows and use a landscape table', () => {
  const exportsSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/productivityReportExports.js'), 'utf8');
  assert.match(exportsSource, /User Activity & Productivity Report/);
  assert.match(exportsSource, /orientation: 'landscape'/);
  assert.match(exportsSource, /jspdf-autotable/);
  assert.match(exportsSource, /showHead: 'everyPage'/);
  assert.match(exportsSource, /rowPageBreak: 'avoid'/);
  assert.match(exportsSource, /Page \$\{page\} of \$\{pages\}/);
  assert.match(exportsSource, /User_Activity_Productivity_Report_\$\{period\.to\}\.pdf/);
  assert.match(exportsSource, /'Support Tickets Raised'/);
});
