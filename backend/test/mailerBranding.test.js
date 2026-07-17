const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBrandedEmail } = require('../src/utils/mailer');

test('mailer injects the Anant Tattva logo into complete HTML emails', () => {
  const output = buildBrandedEmail('<html><body><h1>OTP</h1></body></html>');
  assert.match(output, /data-crm-mail-brand="true"/);
  assert.match(output, /alt="ANANT TATTVA"/);
  assert.ok(output.indexOf('data-crm-mail-brand') < output.indexOf('<h1>OTP'));
});

test('mailer brands HTML fragments and never duplicates its header', () => {
  const once = buildBrandedEmail('<p>Approval pending</p>');
  const twice = buildBrandedEmail(once);
  assert.equal((twice.match(/data-crm-mail-brand/g) || []).length, 1);
});

test('mail logo URL is environment configurable and safely escaped', () => {
  const previous = process.env.MAIL_LOGO_URL;
  process.env.MAIL_LOGO_URL = 'https://example.com/logo.png?x=1&y=2';
  try {
    assert.match(buildBrandedEmail('<p>Hello</p>'), /logo\.png\?x=1&amp;y=2/);
  } finally {
    if (previous === undefined) delete process.env.MAIL_LOGO_URL; else process.env.MAIL_LOGO_URL = previous;
  }
});
