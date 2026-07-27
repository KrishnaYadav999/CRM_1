const test = require('node:test');
const assert = require('node:assert/strict');
const { sendMail, resetGraphTokenCache } = require('../src/utils/mailer');

const GRAPH_ENV_KEYS = [
  'MAIL_PROVIDER',
  'MS_TENANT_ID',
  'MS_CLIENT_ID',
  'MS_CLIENT_SECRET',
  'OTP_SENDER_EMAIL',
  'MAIL_REPLY_TO'
];

function withGraphEnvironment(run) {
  const previous = Object.fromEntries(GRAPH_ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.MAIL_PROVIDER = 'microsoft-graph';
  process.env.MS_TENANT_ID = 'tenant-id';
  process.env.MS_CLIENT_ID = 'client-id';
  process.env.MS_CLIENT_SECRET = 'test-secret';
  process.env.OTP_SENDER_EMAIL = 'crm@ananttattva.com';
  process.env.MAIL_REPLY_TO = 'crm@ananttattva.com';
  resetGraphTokenCache();

  return Promise.resolve()
    .then(run)
    .finally(() => {
      GRAPH_ENV_KEYS.forEach((key) => {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      });
      resetGraphTokenCache();
    });
}

test('all configured mail is sent through the Outlook mailbox using Microsoft Graph', async () => {
  await withGraphEnvironment(async () => {
    const previousFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (String(url).includes('/oauth2/v2.0/token')) {
        return new Response(JSON.stringify({ access_token: 'token-value', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(null, { status: 202 });
    };

    try {
      const result = await sendMail(
        ['sonal@example.com', 'shubham@example.com'],
        'Lead assigned',
        '<p>Please begin onboarding.</p>'
      );

      assert.equal(calls.length, 2);
      assert.match(calls[0].url, /login\.microsoftonline\.com\/tenant-id\/oauth2\/v2\.0\/token$/);
      assert.match(String(calls[0].options.body), /scope=https%3A%2F%2Fgraph\.microsoft\.com%2F\.default/);
      assert.equal(
        calls[1].url,
        'https://graph.microsoft.com/v1.0/users/crm%40ananttattva.com/sendMail'
      );
      assert.equal(calls[1].options.headers.Authorization, 'Bearer token-value');
      const payload = JSON.parse(calls[1].options.body);
      assert.deepEqual(
        payload.message.toRecipients.map((recipient) => recipient.emailAddress.address),
        ['sonal@example.com', 'shubham@example.com']
      );
      assert.equal(payload.message.body.contentType, 'HTML');
      assert.equal(payload.saveToSentItems, true);
      assert.equal(result.summary.provider, 'microsoft-graph');
      assert.equal(result.summary.sender, 'crm@ananttattva.com');
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test('Microsoft Graph access token is reused until it nears expiry', async () => {
  await withGraphEnvironment(async () => {
    const previousFetch = global.fetch;
    let tokenRequests = 0;
    let mailRequests = 0;
    global.fetch = async (url) => {
      if (String(url).includes('/oauth2/v2.0/token')) {
        tokenRequests += 1;
        return new Response(JSON.stringify({ access_token: 'cached-token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      mailRequests += 1;
      return new Response(null, { status: 202 });
    };

    try {
      await sendMail('first@example.com', 'First', '<p>First</p>');
      await sendMail('second@example.com', 'Second', '<p>Second</p>');
      assert.equal(tokenRequests, 1);
      assert.equal(mailRequests, 2);
    } finally {
      global.fetch = previousFetch;
    }
  });
});
