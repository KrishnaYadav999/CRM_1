const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx'), 'utf8');

test('super admin dashboard uses live overview and audit data with date filters', () => {
  assert.match(page, /API_ENDPOINTS\.auth\.userProductivityReport/);
  assert.match(page, /params: \{ from: appliedFilters\.from, to: appliedFilters\.to \}/);
  assert.match(page, /timeZone: 'Asia\/Kolkata'/);
  assert.doesNotMatch(page, /return request\(\)/);
  assert.match(page, /reportResult = await loadProductivityReport\(60000\)/);
  assert.match(page, /reportResult = await loadProductivityReport\(90000\)/);
  assert.match(page, /Unable to load Quotation MIS/);
  assert.match(page, />Valid Until<\/th>/);
  assert.match(page, /formatReportDate\(row\.validUntil\)/);
  assert.match(page, />PO Status<\/th>/);
  assert.match(page, /quotationPoStatus\(row, quotationLeads\)/);
  assert.match(page, /Unable to load PO statuses for Quotation MIS/);
  assert.match(page, /revision_required: \{ label: 'Revision Required'/);
  assert.match(page, /function displayText\(value, fallback = '-'\)/);
  assert.match(page, /displayText\(row\.preparedBy \|\| row\.createdByName \|\| row\.createdBy\)/);
  assert.match(page, /function entityId\(value\)/);
  assert.match(page, /function buildFallbackMisReport\(/);
  assert.match(page, /API_ENDPOINTS\.auth\.users/);
  assert.match(page, /API_ENDPOINTS\.leads\.list/);
  assert.match(page, /API_ENDPOINTS\.clients\.list/);
  assert.match(page, /API_ENDPOINTS\.teams\.list/);
  assert.match(page, /Sales and Operation MIS are showing current CRM records/);
});

test('super admin dashboard exposes productivity, risk, reporting, and user-management actions', () => {
  assert.match(page, /Never logged in/);
  assert.match(page, /High away ratio/);
  assert.match(page, /Inactive accounts/);
  assert.match(page, /REPORT_TITLE/);
  assert.match(page, /Support Tickets Raised/);
  assert.match(page, /Generating PDF\.\.\./);
  assert.match(page, /Export Excel/);
  assert.doesNotMatch(page, /Apply Filters/);
  assert.match(page, /setAppliedFilters\(\(current\) =>/);
  assert.match(page, /MisOverviewCard/);
  assert.match(page, /Overall Summary/);
  assert.doesNotMatch(page, /Highest CRM Actions/);
  assert.doesNotMatch(page, /CRM Actions & Support Tickets/);
  assert.match(page, /Open User Management/);
  assert.match(page, /navigate\('\/dashboard\/users'\)/);
  assert.match(page, /Daily timeline/);
  assert.match(page, /Recent CRM actions/);
  assert.match(page, /Latest access/);
});

test('sales dashboard shows sub applicant details under PIBO and preserves services offered', () => {
  const dashboard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx'), 'utf8');
  assert.match(dashboard, /Array\.isArray\(lead\.serviceSelections\).*lead\.serviceSelections\.length/s);
  assert.match(dashboard, /service\.subApplicantType \|\| service\.piboCategory/);
  assert.match(dashboard, /service\.servicesOffered \|\| service\.serviceOffered \|\| service\.applicableService/);
  assert.match(dashboard, />\s*PIBO Category\s*<\/button>/);
  assert.match(dashboard, />\s*Services Offered\s*<\/button>/);
  assert.match(dashboard, /rows: analytics\.subApplicantTypes/);
  assert.doesNotMatch(dashboard, /rows: analytics\.applicantTypes/);
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
