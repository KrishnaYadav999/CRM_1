const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerSource = fs.readFileSync(path.join(__dirname, '../src/controllers/clientController.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');

test('pending client approval API checks every assigned role', () => {
  assert.match(controllerSource, /userHasAnyRole\(req\.user, \['compliance'\]\)/);
  assert.doesNotMatch(controllerSource, /const requesterRole = normalizeRoleName\(req\.user\?\.role\)/);
});

test('Pending Approval UI recognizes secondary Compliance role and invalidates old empty cache', () => {
  assert.match(pageSource, /hasAnyRole\(currentUser, \['compliance'\]\)/);
  assert.match(pageSource, /crm\.pendingApproval\.cache\.v5/);
  assert.doesNotMatch(pageSource, /isComplianceRole\(currentUser\?\.role\)/);
});
