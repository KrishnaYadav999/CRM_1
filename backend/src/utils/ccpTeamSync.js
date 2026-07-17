const DEFAULT_CCP_TEAM_SYNC_URL = 'https://ccp-62b2.onrender.com/api/crm/teams/sync';
const { postJsonToCcp } = require('./ccpSync');

function readSyncUrl() {
  return String(process.env.CCP_TEAM_SYNC_URL || DEFAULT_CCP_TEAM_SYNC_URL).trim();
}

function idOf(value) {
  return String(value?._id || value?.id || value || '').trim();
}

function buildTeamPayload(team, action) {
  return {
    action,
    crmTeamId: idOf(team),
    ccpTeamId: team.ccpTeamId,
    name: team.name,
    description: team.description || '',
    managerId: idOf(team.manager),
    operationHeadId: idOf(team.operationHead),
    members: (team.members || []).map(idOf).filter(Boolean),
    source: 'crm',
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

async function syncTeamToCcp(team, { action } = {}) {
  return postJsonToCcp(readSyncUrl(), buildTeamPayload(team, action), 'CCP team sync failed');
}

module.exports = { syncTeamToCcp };
