const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/services/leadWorkflowReminders');

test('getCcpLeads returns an empty list when the CCP endpoint is unreachable', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  try {
    const leads = await __test.getCcpLeads();
    assert.deepEqual(leads, []);
  } finally {
    global.fetch = originalFetch;
  }
});
