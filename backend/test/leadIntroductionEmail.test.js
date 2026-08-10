const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EPR_SERVICE_FILENAME,
  COMPANY_PROFILE_FILENAME,
  LOGO_FILENAME,
  LOGO_CONTENT_ID,
  buildLeadIntroductionEmail,
  getIntroductionAttachments,
  getIntroductionLogoAttachment,
  getLeadEmailRecipients,
  getIntroductionCc
} = require('../src/services/leadIntroductionEmail');

test('lead introduction email is professionally formatted with the company closing', () => {
  const email = buildLeadIntroductionEmail({ company: 'Example <Industries>', leadCode: 'ATPL-1001' });
  assert.match(email.subject, /Introduction - AnantTattva Private Limited/);
  assert.match(email.html, /AnantTattva Pvt Ltd/);
  assert.match(email.html, /Greetings from AnantTattva Private Limited!/);
  assert.match(email.html, /PPWR \(Europe Policy\)/);
  assert.match(email.html, /P-EPR \(UK Policy\)/);
  assert.match(email.html, /Looking forward to your positive revert/);
  assert.doesNotMatch(email.html, /8169727341/);
  assert.match(email.html, /आओ सब मिलकर भारत को विश्वगुरु बनाते हैं।/);
  assert.match(email.html, /India’s Leading and Only Advisors/);
  assert.match(email.html, new RegExp(`cid:${LOGO_CONTENT_ID}`));
  assert.doesNotMatch(email.html, /Official Numbers:/);
  assert.doesNotMatch(email.html, /Website:/);
  assert.match(email.html, /Sustainability-Based Market Intelligence/);
  assert.match(email.html, /EPR Compliance Service/);
  assert.match(email.html, /AnantTattva Company Profile/);
  assert.match(email.html, /Thanks &amp; Regards,/);
  assert.match(email.html, /Team AnantTattva/);
  assert.doesNotMatch(email.html, /Team AnantTattva Private Limited/);
  assert.doesNotMatch(email.html, /CRM Lead:/);
  assert.doesNotMatch(email.html, /Lead ID:/);
});

test('lead introduction uses an inline email-safe PNG logo', () => {
  const logo = getIntroductionLogoAttachment();
  assert.equal(logo.filename, LOGO_FILENAME);
  assert.equal(logo.contentType, 'image/png');
  assert.equal(logo.contentId, LOGO_CONTENT_ID);
  assert.equal(logo.isInline, true);
  assert.ok(Buffer.isBuffer(logo.content));
  assert.equal(logo.content.subarray(1, 4).toString(), 'PNG');
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
  assert.match(controller, /findOneAndUpdate\(\{[\s\S]*introductionEmailVersion:[\s\S]*\$lte: 0/);
  assert.match(controller, /introductionEmailSentAt: \{ \$exists: false \}/);
  assert.match(controller, /already-claimed/);
});

test('lead updates send introduction only on the first draft-to-submitted transition', () => {
  const controller = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/controllers/leadController.js'), 'utf8');
  assert.match(controller, /beforeLead\.workflowStatus !== 'submitted' && lead\.workflowStatus === 'submitted'/);
  assert.equal((controller.match(/await sendIntroductionOnce\(lead, req\.user\)/g) || []).length, 2);
});
