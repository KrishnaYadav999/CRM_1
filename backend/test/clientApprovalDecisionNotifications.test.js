const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClientApprovalDecisionEmail } = require('../src/services/clientApprovalDecisionNotifications');

test('client approval email clearly tells the requester the request was approved', () => {
  const email = buildClientApprovalDecisionEmail({ clientName: 'Acme Industries', status: 'APPROVED', remarks: 'Verified', reviewerName: 'CRM Admin', recipientName: 'Ravi' });
  assert.match(email.subject, /Client Master Final Approval - Acme Industries/);
  assert.match(email.html, /Hello <strong>Ravi<\/strong>/);
  assert.match(email.html, /has been <strong[^>]*>approved<\/strong>/);
  assert.match(email.html, /Remarks:<\/strong> Verified/);
  assert.match(email.html, /Team AnantTattva/);
});

test('partial approval email lists completed and pending tabs', () => {
  const email = buildClientApprovalDecisionEmail({
    clientName: 'Acme Industries', status: 'PENDING', approvalMode: 'PARTIAL', remarks: 'Complete pending tabs',
    sections: [
      { label: 'Company Overview', status: 'VERIFIED' },
      { label: 'Documents', status: 'CHANGES_REQUIRED', remarks: 'Upload GST' }
    ]
  });
  assert.match(email.subject, /Client Master Partial Approval/);
  assert.match(email.html, /Completed \/ Approved Tabs \(1\)/);
  assert.match(email.html, /Pending \/ Action Required Tabs \(1\)/);
  assert.match(email.html, /Company Overview/);
  assert.match(email.html, /Upload GST/);
});

test('client rejection email uses rejection wording and safely escapes values', () => {
  const email = buildClientApprovalDecisionEmail({ clientName: 'A & B', status: 'REJECTED', remarks: '<missing document>', recipientName: 'User' });
  assert.match(email.subject, /Client Master Rejected/);
  assert.match(email.html, /has been <strong[^>]*>rejected<\/strong>/);
  assert.match(email.html, /A &amp; B/);
  assert.match(email.html, /&lt;missing document&gt;/);
});
