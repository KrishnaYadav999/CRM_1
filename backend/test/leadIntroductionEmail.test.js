const test = require('node:test');
const assert = require('node:assert/strict');
const { PROFILE_FILENAME, buildLeadIntroductionEmail, getCompanyProfileAttachment } = require('../src/services/leadIntroductionEmail');

test('lead introduction email is professionally formatted with the company closing', () => {
  const email = buildLeadIntroductionEmail({ company: 'Example <Industries>', leadCode: 'ATPL-1001' });
  assert.match(email.subject, /Introduction - AnantTattva Private Limited/);
  assert.match(email.html, /Greetings from AnantTattva Private Limited!/);
  assert.match(email.html, /EPR End-to-End Compliance/);
  assert.match(email.html, /PPWR/);
  assert.match(email.html, /Automated Compliance Risk Assessment/);
  assert.match(email.html, /System data integration for SAP, Tally and ERP/);
  assert.match(email.html, /Sustainability-Based Market Intelligence/);
  assert.match(email.html, /Thanks and regards,/);
  assert.match(email.html, /Team AnantTattva/);
  assert.doesNotMatch(email.html, /Team AnantTattva Private Limited/);
  assert.doesNotMatch(email.html, /CRM Lead:/);
  assert.doesNotMatch(email.html, /Lead ID:/);
});

test('lead introduction includes the supplied EPR compliance service PDF attachment', () => {
  const attachment = getCompanyProfileAttachment();
  assert.equal(attachment.filename, PROFILE_FILENAME);
  assert.equal(attachment.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(attachment.content));
  assert.ok(attachment.content.length > 100_000);
  assert.equal(attachment.content.subarray(0, 4).toString(), '%PDF');
});
