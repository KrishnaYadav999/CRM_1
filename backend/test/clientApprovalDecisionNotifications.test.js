const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClientApprovalDecisionEmail } = require('../src/services/clientApprovalDecisionNotifications');

test('client approval email clearly tells the requester the request was approved', () => {
  const email = buildClientApprovalDecisionEmail({ clientName: 'Acme Industries', status: 'APPROVED', remarks: 'Verified', reviewerName: 'CRM Admin', recipientName: 'Ravi' });
  assert.match(email.subject, /Client Master Approved - Acme Industries/);
  assert.match(email.html, /Hello <strong>Ravi<\/strong>/);
  assert.match(email.html, /has been <strong[^>]*>approved<\/strong>/);
  assert.match(email.html, /Remarks:<\/strong> Verified/);
  assert.match(email.html, /Team AnantTattva/);
});

test('client rejection email uses rejection wording and safely escapes values', () => {
  const email = buildClientApprovalDecisionEmail({ clientName: 'A & B', status: 'REJECTED', remarks: '<missing document>', recipientName: 'User' });
  assert.match(email.subject, /Client Master Rejected/);
  assert.match(email.html, /has been <strong[^>]*>rejected<\/strong>/);
  assert.match(email.html, /A &amp; B/);
  assert.match(email.html, /&lt;missing document&gt;/);
});
