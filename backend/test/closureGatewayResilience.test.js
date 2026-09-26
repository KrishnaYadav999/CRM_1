const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const authController = require('../src/controllers/authController');
const UserSession = require('../src/models/UserSession');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('PO closure persists without waiting for notification email providers', () => {
  const source = read('../src/controllers/leadController.js');
  const start = source.indexOf('async function upsertPurchaseOrderApprovals');
  const end = source.indexOf('function leadCodeSequence', start);
  const workflow = source.slice(start, end);

  assert.match(workflow, /void Promise\.allSettled\(recipients\.map/);
  assert.doesNotMatch(workflow, /await Promise\.allSettled\(recipients\.map/);
});

test('activity heartbeat remains successful when optional telemetry storage fails', async (t) => {
  const originalFindOne = UserSession.findOne;
  t.after(() => { UserSession.findOne = originalFindOne; });
  UserSession.findOne = async () => { throw new Error('temporary database failure'); };

  let response;
  await authController.activityHeartbeat(
    { authSessionId: 'session-1', user: { _id: 'user-1' }, body: { state: 'active' } },
    { json(payload) { response = payload; return payload; } }
  );

  assert.deepEqual(response, { ok: true, tracking: false, reason: 'telemetry-unavailable' });
});
