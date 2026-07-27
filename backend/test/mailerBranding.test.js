const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBrandedEmail } = require('../src/utils/mailer');

test('mailer does not inject a company logo into complete HTML emails', () => {
  const output = buildBrandedEmail('<html><body><h1>OTP</h1></body></html>');
  assert.doesNotMatch(output, /<img|logo|data-crm-mail-brand/i);
  assert.match(output, /<h1>OTP/);
});

test('mailer wraps HTML fragments without adding an image header', () => {
  const once = buildBrandedEmail('<p>Approval pending</p>');
  assert.doesNotMatch(once, /<img|logo|data-crm-mail-brand/i);
  assert.match(once, /Approval pending/);
});
