const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CLIENT_APPROVAL_ROLES } = require('../src/constants/roles');

test('client approval actions belong only to the compliance role', () => {
  assert.deepEqual(CLIENT_APPROVAL_ROLES, ['compliance']);
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/clients.js'), 'utf8');
  assert.match(routes, /pending-approvals\/clients\/approve-all'.*requireRoles\(CLIENT_APPROVAL_ROLES\)/);
  assert.match(routes, /:\id\/approval'.*requireRoles\(CLIENT_APPROVAL_ROLES\)/);
});

test('pending approval separates compliance client review from administrative reviews', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  assert.match(page, /isComplianceApprovalView = normalizedRole === 'compliance'/);
  assert.match(page, /canApproveClients = isComplianceApprovalView/);
  assert.match(page, /isComplianceApprovalView && <Metric[^\n]+Pending Clients/);
  assert.match(page, /!isComplianceApprovalView && <ApprovalTab/);
  assert.match(controller, /pendingClients: isComplianceReviewer \? responseClients : \[\]/);
  assert.match(controller, /pendingQuotations: isAdministrativeReviewer \? responseQuotations : \[\]/);
});

test('pending client company navigation preselects its lead in Client Master', () => {
  const approvals = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');
  const clientMaster = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(approvals, /navigate\('\/sales\/client-master'/);
  assert.match(approvals, /fromPendingApproval: true/);
  assert.match(clientMaster, /location\.state\?\.fromPendingApproval/);
  assert.match(clientMaster, /handleLeadSelect\(leadValue\)/);
});

test('Client Master service choices show applicant and sub applicant types separately', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(page, /piboCategory: row\.subApplicantType \|\| row\.piboCategory/);
  assert.match(page, /Applicant Type: \{applicantType\}/);
  assert.match(page, /Sub Applicant Type: \{subApplicantType\}/);
});
