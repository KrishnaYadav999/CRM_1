const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const PendingApproval = require('../src/models/PendingApproval');
const { correctionEmail } = require('../src/services/clientComplianceCorrectionReminders');
const { buildClientApprovalDecisionEmail } = require('../src/services/clientApprovalDecisionNotifications');

test('pending approval persists the 24-hour, 48-hour and permanent-red correction state', () => {
  const reminderFlag = PendingApproval.schema.path('reminderFlag');
  assert.ok(reminderFlag.enumValues.includes('PERMANENT_RED'));
  assert.ok(PendingApproval.schema.path('correctionReminderAt'));
  assert.ok(PendingApproval.schema.path('correctionDueAt'));
  assert.ok(PendingApproval.schema.path('correctionBreachedAt'));
  assert.ok(PendingApproval.schema.path('redRecoveryStartedAt'));
  assert.ok(PendingApproval.schema.path('correctionRecipientEmail'));
});

test('partial and rejected decision emails explain the 48-hour SLA and 24-hour recovery window', () => {
  for (const approvalMode of ['PARTIAL', 'REJECTED']) {
    const email = buildClientApprovalDecisionEmail({
      clientName: 'Example Client',
      status: 'REJECTED',
      approvalMode,
      recipientName: 'Client Manager'
    });
    assert.match(email.html, /within 48 hours/i);
    assert.match(email.html, /reminder.*24 hours/i);
    assert.match(email.html, /final 24-hour recovery window/i);
    assert.match(email.html, /after 72 hours/i);
  }
});

test('scheduled correction emails distinguish reminder, recoverable red and permanent red', () => {
  const record = {
    clientName: 'Example Client',
    correctionRecipientName: 'Client Manager',
    correctionDecision: 'PARTIALLY_APPROVED',
    correctionDueAt: new Date('2026-09-06T10:00:00.000Z'),
    greenFlagDeadline: new Date('2026-09-07T10:00:00.000Z')
  };
  const reminder = correctionEmail(record, 'REMINDER');
  const recoverable = correctionEmail(record, 'RED_RECOVERY');
  const permanent = correctionEmail(record, 'PERMANENT');
  assert.match(reminder.subject, /24-Hour Correction Reminder/);
  assert.match(reminder.html, /24 hours remain/i);
  assert.match(recoverable.subject, /Final 24-Hour Recovery/i);
  assert.match(recoverable.html, /return the flag to green/i);
  assert.match(permanent.subject, /Permanent Red Flag Applied/);
  assert.match(permanent.html, /recovery window has expired/i);
});

test('compliance correction workflow uses a 72-hour permanent-red deadline and permits timely red-to-green approval', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientComplianceReviewController.js'), 'utf8');
  const scheduler = fs.readFileSync(path.resolve(__dirname, '../src/services/clientComplianceCorrectionReminders.js'), 'utf8');
  assert.match(controller, /greenFlagDeadline: new Date\(decidedAt\.getTime\(\) \+ 72 \* 60 \* 60 \* 1000\)/);
  assert.match(controller, /reminderFlag: permanentRed \? 'PERMANENT_RED' : 'GREEN'/);
  assert.match(controller, /reminderFlag: permanentRed \? 'PERMANENT_RED' : 'RED'/);
  assert.match(scheduler, /reminderFlag: 'RED'/);
  assert.match(scheduler, /legacyRecoveryGrants/);
  assert.match(scheduler, /redRecoveryStartedAt: null/);
  assert.match(scheduler, /greenFlagDeadline: \{ \$lte: now \}/);
  assert.match(scheduler, /reminderFlag: 'PERMANENT_RED'/);
});
