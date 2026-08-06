const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLeadIntroductionEmail } = require('../src/services/leadIntroductionEmail');

test('lead introduction email is professionally formatted and escapes lead data', () => {
  const email = buildLeadIntroductionEmail({ company: 'Example <Industries>', leadCode: 'ATPL-1001' });
  assert.match(email.subject, /Introduction - AnantTattva Private Limited/);
  assert.match(email.html, /Greetings from AnantTattva Private Limited!/);
  assert.match(email.html, /EPR End-to-End Compliance/);
  assert.match(email.html, /Sustainability-Based Market Intelligence/);
  assert.match(email.html, /Example &lt;Industries&gt;/);
  assert.doesNotMatch(email.html, /Example <Industries>/);
});
