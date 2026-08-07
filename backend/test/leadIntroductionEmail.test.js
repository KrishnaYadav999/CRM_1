const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EPR_SERVICE_FILENAME,
  COMPANY_PROFILE_FILENAME,
  buildLeadIntroductionEmail,
  getIntroductionAttachments,
  getLeadEmailRecipients,
  getIntroductionCc
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
  assert.match(email.html, /Thanks and regards,/);
  assert.match(email.html, /Team AnantTattva/);
  assert.doesNotMatch(email.html, /Team AnantTattva Private Limited/);
  assert.doesNotMatch(email.html, /CRM Lead:/);
  assert.doesNotMatch(email.html, /Lead ID:/);
});

test('lead introduction CC contains only the original generator and never admins', () => {
  assert.deepEqual(getIntroductionCc('Creator@Example.com', ['client@example.com']), ['creator@example.com']);
  assert.deepEqual(getIntroductionCc('client@example.com', ['client@example.com']), []);
});

test('lead introduction is addressed to unique customer contact emails', () => {
  assert.deepEqual(getLeadEmailRecipients({
    emails: 'Primary@Example.com',
    contacts: [{ emails: 'primary@example.com' }, { emails: 'second@example.com' }]
  }), ['primary@example.com', 'second@example.com']);
});

test('lead introduction attaches both email-safe PDFs', () => {
  const attachments = getIntroductionAttachments();
  assert.deepEqual(attachments.map(({ filename }) => filename), [EPR_SERVICE_FILENAME, COMPANY_PROFILE_FILENAME]);
  for (const attachment of attachments) {
    assert.equal(attachment.contentType, 'application/pdf');
    assert.ok(Buffer.isBuffer(attachment.content));
    assert.ok(attachment.content.length > 100_000);
    assert.equal(attachment.content.subarray(0, 4).toString(), '%PDF');
  }
  assert.ok(attachments.reduce((total, attachment) => total + attachment.content.length, 0) < 3 * 1024 * 1024);
});

test('lead controller atomically claims introduction delivery before sending', () => {
  const controller = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/controllers/leadController.js'), 'utf8');
  assert.match(controller, /findOneAndUpdate\(\{[\s\S]*introductionEmailVersion:[\s\S]*\$lt: INTRODUCTION_EMAIL_VERSION/);
  assert.match(controller, /already-claimed/);
});
