const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const leadController = require('../src/controllers/leadController');

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');

test('Health Report workflow requires Manager review before user assignment', () => {
  const controller = read('../src/controllers/healthReportAssignmentController.js');
  const model = read('../src/models/HealthReportAssignment.js');
  assert.match(model, /MANAGER_REVIEW.*ASSIGNED.*IN_PROGRESS.*COMPLETED/);
  assert.match(controller, /role: 'manager'/);
  assert.match(controller, /Only the selected Manager can assign this Health Report/);
  assert.match(controller, /Please review it and select a user so work can begin/);
  assert.match(controller, /audience: \[manager\._id\]/);
});

test('Health Report has a separate routed workspace and assigned-user list', () => {
  const app = read('../../frontend/src/App.jsx');
  const sidebar = read('../../frontend/src/constants/dashboard.js');
  const page = read('../../frontend/src/pages/HealthReportCheck.jsx');
  assert.match(app, /\/sales\/health-report-check/);
  assert.match(sidebar, /Health Report Check/);
  assert.match(page, /Choose Existing Health Report/);
  assert.match(page, /Please select user/);
});

test('Lead submit opens the Health Report form before asking for a Manager', () => {
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');
  assert.match(page, /Please complete the Compliance Health Report/);
  assert.match(page, /setHealthReportLead\(savedLead\)[\s\S]*setHealthAssignmentOpen\(false\)/);
  assert.match(page, /Compliance Health Report saved\. Please select a Manager for review/);
  assert.match(page, /setHealthReportLead\(savedLead\)[\s\S]*setHealthAssignmentOpen\(true\)/);
  assert.match(page, /setHealthAssignmentOpen\(true\)/);
  assert.match(page, /Please select Manager/);
  assert.match(page, /healthReportLead && !healthAssignmentOpen/);
  assert.match(page, /Mobile Number for OTP/);
  assert.match(page, /SSO CPCB Password/);
});

test('initial allocation popup only captures company and portal credentials before Manager selection', () => {
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');
  assert.match(page, /function ComplianceHealthAllocationModal/);
  assert.match(page, /COMPLIANCE HEALTH REPORT ALLOCATION/);
  assert.match(page, /Company Name/);
  assert.match(page, /Mobile Number for OTP/);
  assert.match(page, /CPCB Login ID/);
  assert.match(page, /CPCB Password/);
  assert.match(page, /SSO CPCB Login ID/);
  assert.match(page, /SSO CPCB Password/);
  assert.match(page, /value=\{lead\.company \|\| ''\} readOnly/);
  assert.match(page, /onSubmit\(\{ allocation: true \}\)/);
  assert.match(page, /reportName: allocation \? 'COMPLIANCE HEALTH REPORT ALLOCATION'/);
  assert.match(page, /allocationSubmittedAt: allocation \? new Date\(\)\.toISOString\(\)/);
});

test('allocation credentials and allocation metadata are preserved for the Lead database record', () => {
  const allocation = {
    reportName: 'COMPLIANCE HEALTH REPORT ALLOCATION',
    otpMobile: '9876543210',
    cpcbLoginId: 'cpcb-user',
    cpcbPassword: 'cpcb-password',
    ssoCpcbLoginId: 'sso-user',
    ssoCpcbPassword: 'sso-password',
    allocationSubmittedAt: new Date().toISOString()
  };
  const cleaned = leadController._test.cleanBody({ complianceHealthReport: allocation });
  assert.deepEqual(cleaned.complianceHealthReport, allocation);
});
