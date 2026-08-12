const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CLIENT_APPROVAL_ROLES } = require('../src/constants/roles');

test('client approval actions belong to admins and the compliance role family', () => {
  assert.deepEqual(CLIENT_APPROVAL_ROLES, ['admin', 'superadmin', 'compliance']);
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/clients.js'), 'utf8');
  assert.match(routes, /pending-approvals\/clients\/approve-all'.*requireRoles\(CLIENT_APPROVAL_ROLES\)/);
  assert.match(routes, /:\id\/approval'.*requireRoles\(CLIENT_APPROVAL_ROLES\)/);
});

test('pending approval shows only client review to compliance-family and administrative reviewers', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  assert.match(page, /isComplianceApprovalView = isComplianceRole\(currentUser\?\.role\) && !canApprove/);
  assert.match(page, /canApproveClients = canApprove \|\| isComplianceApprovalView/);
  assert.match(page, /canApproveClients && <Metric[^\n]+Pending Clients/);
  assert.match(page, /!isComplianceApprovalView && <ApprovalTab/);
  assert.match(controller, /requesterRole\.includes\('compliance'\)/);
  assert.match(controller, /pendingClients: isClientReviewer \? responseClients : \[\]/);
  assert.match(controller, /pendingQuotations: isAdministrativeReviewer \? responseQuotations : \[\]/);
});

test('custom compliance roles pass compliance-family authorization and sidebar visibility', () => {
  const middleware = fs.readFileSync(path.resolve(__dirname, '../src/middleware/auth.js'), 'utf8');
  const sidebar = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/dashboard/Sidebar.jsx'), 'utf8');
  assert.match(middleware, /normalizedRole\.includes\('compliance'\)/);
  assert.match(sidebar, /item\.complianceFamily && isComplianceRole\(currentUser\?\.role\)/);
});

test('pending client company navigation preselects its lead in Client Master', () => {
  const approvals = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');
  const clientMaster = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(approvals, /navigate\(`\/pending-approval\/clients\/\$\{row\.id\}\/review`\)/);
  assert.match(approvals, /fromPendingApproval: true/);
  assert.match(clientMaster, /location\.state\?\.fromPendingApproval/);
  assert.match(clientMaster, /handleLeadSelect\(leadValue\)/);
});

test('client decisions require a 250-character note modal and backend validation', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  const model = fs.readFileSync(path.resolve(__dirname, '../src/models/PendingApproval.js'), 'utf8');
  assert.match(page, /maxLength=\{250\}/);
  assert.match(page, /submitClientDecision/);
  assert.match(page, /remarks: decisionNote/);
  assert.match(controller, /Approval note.*Rejection reason.*is required/);
  assert.match(controller, /remarks\.length > 250/);
  assert.match(controller, /notifyClientApprovalDecision/);
  assert.match(model, /remarks:.*maxlength: 250/);
});

test('Client Master service choices show applicant and sub applicant types separately', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(page, /piboCategory: row\.subApplicantType \|\| row\.piboCategory/);
  assert.match(page, /Applicant Type: \{applicantType\}/);
  assert.match(page, /Sub Applicant Type: \{subApplicantType\}/);
});

test('pending client approvals use the 24h, 24h, red flag and 48h compliance workflow', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '../src/services/pendingApprovalNotifications.js'), 'utf8');
  const model = fs.readFileSync(path.resolve(__dirname, '../src/models/PendingApproval.js'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  assert.match(service, /TWENTY_FOUR_HOURS = 24 \* 60 \* 60 \* 1000/);
  assert.match(service, /Math\.max\(2, Number\(process\.env\.PENDING_APPROVAL_MAX_REMINDERS\)/);
  assert.match(service, /reminderFlag: 'RED'/);
  assert.match(service, /greenFlagDeadline: new Date\(now\.getTime\(\) \+ 48 \* 60 \* 60 \* 1000\)/);
  assert.match(service, /types\.has\('client'\) \? \['compliance'\]/);
  assert.match(model, /reminderFlag:.*GREEN.*RED/);
  assert.match(controller, /reminderFlag: 'GREEN'/);
  assert.match(controller, /greenFlagAt: new Date\(\)/);
});
