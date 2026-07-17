const DEFAULT_CCP_USER_SYNC_URL = 'https://ccp-62b2.onrender.com/api/crm/users/sync';
const { postJsonToCcp } = require('./ccpSync');

function readSyncUrl() {
  return String(process.env.CCP_USER_SYNC_URL || DEFAULT_CCP_USER_SYNC_URL).trim();
}

function buildUserPayload(user, action, password) {
  const payload = {
    action,
    crmUserId: String(user._id || user.id),
    ccpUserId: user.ccpUserId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    team: user.team,
    teamId: user.teamId,
    managerId: user.managerId,
    operationHeadId: user.operationHeadId,
    isActive: user.isActive,
    source: 'crm',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };

  if (action === 'create' && process.env.CCP_SYNC_PASSWORD === 'true' && password) {
    payload.password = password;
  }

  return payload;
}

function readCcpUserIdFromSync(syncResult) {
  const payload = syncResult?.response || {};
  return String(
    payload.ccpUserId
    || payload.user?.ccpUserId
    || payload.user?.id
    || payload.user?._id
    || payload.data?.ccpUserId
    || payload.data?.id
    || payload.data?._id
    || payload.id
    || payload._id
    || ''
  ).trim();
}

async function saveSyncedCcpUserId(user, syncResult) {
  if (!user || syncResult?.ok === false || typeof user.save !== 'function') return;

  const ccpUserId = readCcpUserIdFromSync(syncResult);
  if (!ccpUserId || String(user.ccpUserId || '') === ccpUserId) return;

  user.ccpUserId = ccpUserId;
  await user.save();
}

async function syncUserToCcp(user, { action, password } = {}) {
  const url = readSyncUrl();
  return postJsonToCcp(url, buildUserPayload(user, action, password), 'CCP user sync failed');
}

async function syncUsersToCcp(users) {
  const results = [];

  for (const user of users) {
    const result = await syncUserToCcp(user, { action: 'update' });
    await saveSyncedCcpUserId(user, result);
    results.push({
      userId: String(user._id || user.id),
      email: user.email,
      ...result
    });
  }

  return results;
}

module.exports = { syncUserToCcp, syncUsersToCcp, __test: { buildUserPayload } };
