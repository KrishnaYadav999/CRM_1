const assert = require('node:assert/strict');
const test = require('node:test');

const PendingApproval = require('../src/models/PendingApproval');
const { correctionEmail } = require('../src/services/clientComplianceCorrectionReminders');
const { buildClientApprovalDecisionEmail } = require('../src/services/clientApprovalDecisionNotifications');

test('pending approval persists the 24-hour, 48-hour and permanent-red correction state', () => {
  const reminderFlag = PendingApproval.schema.path('reminderFlag');
  assert.ok(reminderFlag.enumValues.includes('PERMANENT_RED'));
  assert.ok(PendingApproval.schema.path('correctionReminderAt'));
  assert.ok(PendingApproval.schema.path('correctionDueAt'));
  assert.ok(PendingApproval.schema.path('correctionBreachedAt'));
  assert.ok(PendingApproval.schema.path('correctionRecipientEmail'));
});

test('partial and rejected decision emails explain the correction SLA', () => {
  for (const approvalMode of ['PARTIAL', 'REJECTED']) {
    const email = buildClientApprovalDecisionEmail({
      clientName: 'Example Client',
      status: 'REJECTED',
      approvalMode,
      recipientName: 'Client Manager'
    });
    assert.match(email.html, /within 48 hours/i);
    assert.match(email.html, /reminder.*24 hours/i);
    assert.match(email.html, /permanent red flag/i);
  }
});

test('scheduled correction emails distinguish reminder and permanent breach', () => {
  const record = {
    clientName: 'Example Client',
    correctionRecipientName: 'Client Manager',
    correctionDecision: 'PARTIALLY_APPROVED',
    correctionDueAt: new Date('2026-09-06T10:00:00.000Z')
  };
  const reminder = correctionEmail(record, 'REMINDER');
  const breached = correctionEmail(record, 'BREACHED');
  assert.match(reminder.subject, /24-Hour Correction Reminder/);
  assert.match(reminder.html, /24 hours remaining/i);
  assert.match(breached.subject, /Permanent Red Flag Applied/);
  assert.match(breached.html, /48-hour correction deadline has expired/i);
});
