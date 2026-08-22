const test = require('node:test');
const assert = require('node:assert/strict');
const StaffOnboardingAssignment = require('../src/models/StaffOnboardingAssignment');
const {
  ONBOARDING_LIMIT_MS,
  REMINDER_GAP_MS,
  assignmentEmailHtml,
  syncStaffOnboardingCpcbStatus
} = require('../src/services/staffOnboardingWorkflow');

test('staff onboarding deadline is seven days with a 48-hour reminder gap', () => {
  assert.equal(ONBOARDING_LIMIT_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(REMINDER_GAP_MS, 48 * 60 * 60 * 1000);
});

test('CPCB No pauses reminders and Yes restarts a fresh seven-day window', async () => {
  const originalUpdateMany = StaffOnboardingAssignment.updateMany;
  const calls = [];
  StaffOnboardingAssignment.updateMany = async (...args) => { calls.push(args); return { modifiedCount: 1 }; };
  try {
    const now = new Date('2026-08-22T10:00:00.000Z');
    await syncStaffOnboardingCpcbStatus({ leadKey: 'lead-1', staffId: 'staff-1', registered: false, now });
    await syncStaffOnboardingCpcbStatus({ leadKey: 'lead-1', staffId: 'staff-1', registered: true, now });
    assert.deepEqual(calls[0][0].status.$in, ['ACTIVE', 'RED_FLAG']);
    assert.equal(calls[0][1].$set.status, 'CPCB_NOT_REGISTERED');
    assert.equal(calls[1][0].status, 'CPCB_NOT_REGISTERED');
    assert.equal(calls[1][1].$set.status, 'ACTIVE');
    assert.equal(calls[1][1].$set.reminderCount, 0);
    assert.equal(calls[1][1].$set.nextActionAt.getTime(), now.getTime() + ONBOARDING_LIMIT_MS);
  } finally {
    StaffOnboardingAssignment.updateMany = originalUpdateMany;
  }
});

test('assignment email names the company and manager and explains escalation', () => {
  const html = assignmentEmailHtml({
    company: 'Acme Industries',
    managerName: 'Manager One',
    dueAt: new Date('2026-08-03T10:00:00.000Z')
  });
  assert.match(html, /Acme Industries/);
  assert.match(html, /Manager One/);
  assert.match(html, /7 days/);
  assert.match(html, /2 reminders/);
  assert.match(html, /48-hour gap/);
  assert.match(html, /red flag/);
});
