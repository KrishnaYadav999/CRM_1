const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClientApprovalDecisionEmail, clientDecisionMetadata } = require('../src/services/clientApprovalDecisionNotifications');

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

test('client decision email includes all applicant and application metadata', () => {
  const email = buildClientApprovalDecisionEmail({
    clientName: 'Acme Industries', status: 'APPROVED',
    applicantTypes: ['PIBO', 'SIMP'], subApplicantTypes: ['Brand Owner', 'Importer'], applicationTypes: ['New', 'Renewal']
  });
  assert.match(email.html, /Applicant Type:<\/strong> PIBO, SIMP/);
  assert.match(email.html, /Sub Applicant Type:<\/strong> Brand Owner, Importer/);
  assert.match(email.html, /Application Type:<\/strong> New, Renewal/);
});

test('client decision metadata is limited to the rejected Client Master service', () => {
  const metadata = clientDecisionMetadata({
    assignedServiceId: 'service-producer',
    data: { basic: { piboCategory: 'Producer' }, selectedLeadSnapshot: { applicantType: 'PIBO', assignedServiceId: 'service-producer' } },
    selectedLead: { serviceSelections: [
      { assignedServiceId: 'service-producer', applicantType: 'PIBO', subApplicantType: 'Producer' },
      { assignedServiceId: 'service-importer', applicantType: 'PIBO', subApplicantType: 'Importer' }
    ] }
  });
  assert.deepEqual(metadata.applicantTypes, ['PIBO']);
  assert.deepEqual(metadata.subApplicantTypes, ['Producer']);
  assert.doesNotMatch(metadata.subApplicantTypes.join(','), /Importer/i);
});
