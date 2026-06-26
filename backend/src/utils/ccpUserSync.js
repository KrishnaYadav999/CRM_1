const DEFAULT_CCP_USER_SYNC_URL = 'http://localhost:8081/api/crm/users/sync';

function readSyncUrl() {
  return String(process.env.CCP_USER_SYNC_URL || DEFAULT_CCP_USER_SYNC_URL).trim();
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CCP_SHARED_SECRET) headers['x-ccp-secret'] = process.env.CCP_SHARED_SECRET;
  return headers;
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

async function syncUserToCcp(user, { action, password } = {}) {
  const url = readSyncUrl();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(buildUserPayload(user, action, password))
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload.error || payload.message || 'CCP user sync failed'
      };
    }

    return { ok: true, status: response.status, response: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'CCP user sync failed' };
  }
}

async function syncUsersToCcp(users) {
  const results = [];

  for (const user of users) {
    const result = await syncUserToCcp(user, { action: 'update' });
    results.push({
      userId: String(user._id || user.id),
      email: user.email,
      ...result
    });
  }

  return results;
}

module.exports = { syncUserToCcp, syncUsersToCcp };
