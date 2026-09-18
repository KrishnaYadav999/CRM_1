const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../src');
const frontendRoot = path.resolve(__dirname, '../../frontend/src');

test('management approval requires an active Super Admin and a supported source', () => {
  const controller = fs.readFileSync(path.join(backendRoot, 'controllers/quotationController.js'), 'utf8');
  const routes = fs.readFileSync(path.join(backendRoot, 'routes/quotations.js'), 'utf8');

  assert.match(routes, /management-approvers/);
  assert.match(routes, /:id\/management-approval/);
  assert.match(controller, /MANAGEMENT_APPROVAL_SOURCES/);
  assert.match(controller, /The selected approver is not an active Super Admin/);
  assert.match(controller, /approvalKind: 'MANAGEMENT'/);
  assert.match(controller, /quotation\.status = 'approved'/);
});

test('pending quotation table exposes the screenshot-style Super Admin approval modal', () => {
  const page = fs.readFileSync(path.join(frontendRoot, 'pages/PendingApproval.jsx'), 'utf8');
  const model = fs.readFileSync(path.join(backendRoot, 'models/PendingApproval.js'), 'utf8');

  assert.match(page, /Super Admin Approval/);
  assert.match(page, /Super Admin Approve/);
  assert.match(page, /Submit Management Approval/);
  assert.match(page, /Auto-fetched from quotation/);
  assert.match(model, /managementApproverName/);
  assert.match(model, /managementApprovalSource/);
});
