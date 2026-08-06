const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLeadIntroductionEmail } = require('../src/services/leadIntroductionEmail');

test('lead introduction email is professionally formatted with the company closing', () => {
  const email = buildLeadIntroductionEmail({ company: 'Example <Industries>', leadCode: 'ATPL-1001' });
  assert.match(email.subject, /Introduction - AnantTattva Private Limited/);
  assert.match(email.html, /Greetings from AnantTattva Private Limited!/);
  assert.match(email.html, /EPR End-to-End Compliance/);
  assert.match(email.html, /Sustainability-Based Market Intelligence/);
  assert.match(email.html, /Thanks and regards,/);
  assert.match(email.html, /Team AnantTattva Private Limited/);
  assert.doesNotMatch(email.html, /CRM Lead:/);
  assert.doesNotMatch(email.html, /Lead ID:/);
});
