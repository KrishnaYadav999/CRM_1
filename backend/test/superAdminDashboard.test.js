const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx'), 'utf8');

test('super admin dashboard uses live overview and audit data with date filters', () => {
  assert.match(page, /API_ENDPOINTS\.auth\.superAdminOverview/);
  assert.match(page, /API_ENDPOINTS\.auth\.auditLogs/);
  assert.match(page, /params: \{ from: filters\.from, to: filters\.to \}/);
  assert.match(page, /timeZone: 'Asia\/Kolkata'/);
  assert.match(page, /function dailyTimeline\(sessions = \[\]\)/);
});

test('super admin dashboard exposes productivity, risk, reporting, and user-management actions', () => {
  assert.match(page, /function productivityScore\(row\)/);
  assert.match(page, /Never logged in/);
  assert.match(page, /High away ratio/);
  assert.match(page, /Inactive accounts/);
  assert.match(page, /User Activity & Productivity Report/);
  assert.match(page, /Open User Management/);
  assert.match(page, /navigate\('\/dashboard\/users'\)/);
  assert.match(page, /Daily timeline/);
  assert.match(page, /Recent CRM actions/);
  assert.match(page, /Latest access/);
});
