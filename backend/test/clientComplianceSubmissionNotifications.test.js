const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
const notifications = fs.readFileSync(path.resolve(__dirname, '../src/services/clientComplianceSubmissionNotifications.js'), 'utf8');

test('initial Client Master submission notifies active compliance users in-app and by email', () => {
  assert.match(controller, /notifyComplianceClientSubmission\(\{ client, submitter: user, resubmission, previousStatus \}\)/);
  assert.match(notifications, /userHasAnyRole\(user, \['compliance'\]\)/);
  assert.match(notifications, /Notification\.create\(/);
  assert.match(notifications, /sendMail\(recipient\.email, subject, html/);
});

test('partial or rejected Client Master correction returns to pending and re-notifies compliance', () => {
  assert.match(controller, /\['PARTIALLY_APPROVED', 'REJECTED'\]\.includes\(existingApprovalStatus\)/);
  assert.match(controller, /approvalStatus: 'PENDING'/);
  assert.match(controller, /action: 'RESUBMITTED'/);
  assert.match(controller, /resubmission: true, previousStatus: existingApprovalStatus/);
});
