const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const controller = fs.readFileSync(path.join(root, 'backend/src/controllers/temporaryLeadAssignmentController.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'frontend/src/pages/PendingApproval.jsx'), 'utf8');

test('Admin and Super Admin can review temporary users with mandatory 250-word remarks', () => {
  assert.match(controller, /\['admin', 'superadmin'\]\.includes/);
  assert.match(controller, /Remarks are required for approval and rejection/);
  assert.match(controller, /remarkWords > 250/);
  assert.match(controller, /decisionRemarks: remarks/);
  assert.match(controller, /decidedByName/);
});

test('Pending Approval exposes the requested temporary user columns and remarks modal', () => {
  assert.match(page, /Temporary User Requests/);
  assert.match(page, /'Client Name', 'Previous User', 'Temporary User', 'Manager Name'/);
  assert.match(page, /Decision remarks/);
  assert.match(page, /wordCount > 250/);
  assert.match(page, /Remarks saved in the database audit trail/);
});
