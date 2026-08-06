const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EPR_SERVICE_FILENAME,
  COMPANY_PROFILE_FILENAME,
  COMPANY_PROFILE_URL,
  buildLeadIntroductionEmail,
  getIntroductionAttachments,
  getLeadEmailRecipients
} = require('../src/services/leadIntroductionEmail');

test('lead introduction email is professionally formatted with the company closing', () => {
  const email = buildLeadIntroductionEmail({ company: 'Example <Industries>', leadCode: 'ATPL-1001' });
  assert.match(email.subject, /Introduction - AnantTattva Private Limited/);
  assert.match(email.html, /AnantTattva Pvt Ltd/);
  assert.match(email.html, /Greetings from AnantTattva Private Limited!/);
  assert.match(email.html, /EPR End-to-End Compliance/);
  assert.match(email.html, /PPWR/);
  assert.match(email.html, /PPWR \(Europe Policy\)/);
  assert.match(email.html, /P-EPR \(UK Policy\)/);
  assert.match(email.html, /Automated Compliance Risk Assessment/);
  assert.match(email.html, /System data integration for SAP, Tally and ERP/);
  assert.match(email.html, /Sustainability-Based Market Intelligence/);
  assert.match(email.html, /EPR Compliance Service/);
  assert.match(email.html, /AnantTattva Company Profile/);
  assert.ok(email.html.includes(COMPANY_PROFILE_URL));
  assert.match(email.html, /Thanks and regards,/);
  assert.match(email.html, /Team AnantTattva/);
  assert.doesNotMatch(email.html, /Team AnantTattva Private Limited/);
  assert.doesNotMatch(email.html, /CRM Lead:/);
  assert.doesNotMatch(email.html, /Lead ID:/);
});

test('lead introduction is addressed to unique customer contact emails', () => {
  assert.deepEqual(getLeadEmailRecipients({
    emails: 'Primary@Example.com',
    contacts: [{ emails: 'primary@example.com' }, { emails: 'second@example.com' }]
  }), ['primary@example.com', 'second@example.com']);
});

test('lead introduction attaches the EPR PDF and links the large company profile', () => {
  const attachments = getIntroductionAttachments();
  assert.deepEqual(attachments.map(({ filename }) => filename), [EPR_SERVICE_FILENAME]);
  assert.equal(COMPANY_PROFILE_FILENAME, 'Company Profile - AnantTattva Private Limited.pdf');
  for (const attachment of attachments) {
    assert.equal(attachment.contentType, 'application/pdf');
    assert.ok(Buffer.isBuffer(attachment.content));
    assert.ok(attachment.content.length > 100_000);
    assert.equal(attachment.content.subarray(0, 4).toString(), '%PDF');
  }
});
