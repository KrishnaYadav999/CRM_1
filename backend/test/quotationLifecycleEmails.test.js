const test = require('node:test');
const assert = require('node:assert/strict');
const {
  eventLabel,
  quotationLifecycleEmailContent
} = require('../src/services/quotationLifecycleEmails');

const quotation = {
  quotationNumber: 'AT/26-27/001',
  companyName: 'Pinnacle Industries Ltd'
};
const actor = { name: 'KRISHNA Yadav', email: 'krishna@example.com' };

test('quotation generation email identifies pending approval', () => {
  const content = quotationLifecycleEmailContent({ quotation, event: 'created', actor });
  assert.match(content.subject, /Pending Approval/);
  assert.match(content.html, /waiting for approval/);
  assert.match(content.html, /AT\/26-27\/001/);
});

test('quotation revision email requires approval again', () => {
  const content = quotationLifecycleEmailContent({ quotation, event: 'revised', actor });
  assert.equal(eventLabel('revised'), 'Revised — Re-approval Required');
  assert.match(content.html, /requires approval again/);
});

test('quotation decision emails clearly identify approved and rejected status', () => {
  const approved = quotationLifecycleEmailContent({ quotation, event: 'approved', actor });
  const rejected = quotationLifecycleEmailContent({ quotation, event: 'rejected', actor });
  assert.match(approved.subject, /Approved/);
  assert.match(approved.html, /has been approved/);
  assert.match(rejected.subject, /Rejected/);
  assert.match(rejected.html, /has been rejected/);
});
