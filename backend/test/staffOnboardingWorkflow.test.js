const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ONBOARDING_LIMIT_MS,
  REMINDER_GAP_MS,
  assignmentEmailHtml
} = require('../src/services/staffOnboardingWorkflow');

test('staff onboarding deadline is seven days with a 48-hour reminder gap', () => {
  assert.equal(ONBOARDING_LIMIT_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(REMINDER_GAP_MS, 48 * 60 * 60 * 1000);
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
