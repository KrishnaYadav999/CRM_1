const Team = require('../models/Team');
const User = require('../models/User');
const mongoose = require('mongoose');
const { syncTeamToCcp } = require('../utils/ccpTeamSync');

function cleanIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function mapTeam(team) {
  return {
    id: team._id,
    _id: team._id,
    crmTeamId: team.crmTeamId || String(team._id),
    ccpTeamId: team.ccpTeamId,
    source: team.source,
    name: team.name,
    description: team.description,
    members: team.members || [],
    manager: team.manager || null,
    operationHead: team.operationHead || null,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

function readObjectId(value) {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : undefined;
}

function readCcpTeamIdFromSync(syncResult) {
  const payload = syncResult?.response || {};
  return String(
    payload.ccpTeamId
    || payload.team?.ccpTeamId
    || payload.team?.id
    || payload.team?._id
    || payload.data?.ccpTeamId
    || payload.data?.id
    || payload.data?._id
    || ''
  ).trim();
}

async function ensureCrmTeamId(team) {
  if (!team || team.crmTeamId) return team;
  team.crmTeamId = String(team._id || team.id);
  await team.save();
  return team;
}

async function saveSyncedCcpTeamId(team, syncResult) {
  if (!team || syncResult?.ok === false) return;

  const ccpTeamId = readCcpTeamIdFromSync(syncResult);
  if (!ccpTeamId || String(team.ccpTeamId || '') === ccpTeamId) return;

  const duplicate = await Team.findOne({ ccpTeamId, _id: { $ne: team._id } }).select('_id').lean();
  if (duplicate) {
    console.error('CCP team sync returned an id already linked to another CRM team', { ccpTeamId, teamId: String(team._id) });
    return;
  }

  team.ccpTeamId = ccpTeamId;
  await team.save();
}

async function resolveCcpUserId(value) {
  const id = String(value || '').trim();
  if (!id) return undefined;

  const byCcpId = await User.findOne({ ccpUserId: id }).select('_id').lean();
  if (byCcpId) return byCcpId._id;

  if (mongoose.Types.ObjectId.isValid(id)) {
    const byId = await User.findById(id).select('_id').lean();
    if (byId) return byId._id;
  }

  return undefined;
}

async function resolveCcpUserIds(values) {
  const ids = [];
  for (const value of cleanIds(values)) {
    const resolvedId = await resolveCcpUserId(value);
    if (resolvedId) ids.push(String(resolvedId));
  }
  return [...new Set(ids)];
}

async function applyTeamToUsers(team) {
  const memberIds = cleanIds(team.members || []);
  const managerId = String(team.manager || '').trim();
  const operationHeadId = String(team.operationHead || '').trim();

  const memberUpdate = operationHeadId
    ? { $set: { teamId: team._id, team: team.name, managerId, operationHeadId } }
    : { $set: { teamId: team._id, team: team.name, managerId }, $unset: { operationHeadId: '' } };

  await User.updateMany({ _id: { $in: memberIds } }, memberUpdate);
  if (managerId) {
    await User.findByIdAndUpdate(
      managerId,
      operationHeadId
        ? { $set: { teamId: team._id, team: team.name, operationHeadId } }
        : { $set: { teamId: team._id, team: team.name }, $unset: { operationHeadId: '' } }
    );
  }
  if (operationHeadId) await User.findByIdAndUpdate(operationHeadId, { $set: { teamId: team._id, team: team.name } });
}

exports.listTeams = async (req, res) => {
  const teams = await Team.find()
    .populate('members', 'name email role avatarUrl isActive')
    .populate('manager', 'name email role avatarUrl isActive')
    .populate('operationHead', 'name email role avatarUrl isActive')
    .sort({ name: 1 })
    .lean();

  res.json({ ok: true, teams: teams.map(mapTeam) });
};

exports.createTeam = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const memberIds = cleanIds(req.body.members);
  const managerId = String(req.body.manager || req.body.managerId || '').trim();
  const operationHeadId = String(req.body.operationHead || req.body.operationHeadId || '').trim();

  if (!name) return res.status(400).json({ error: 'Team name is required' });
  if (!managerId) return res.status(400).json({ error: 'Manager is required' });

  const existing = await Team.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (existing) return res.status(400).json({ error: 'Team name already exists' });

  const allUserIds = [...new Set([...memberIds, managerId, operationHeadId].filter(Boolean))];
  const users = await User.find({ _id: { $in: allUserIds }, isActive: true }).select('_id').lean();
  if (users.length !== allUserIds.length) return res.status(400).json({ error: 'Select only active CRM users for this team' });

  const teamData = {
    name,
    description,
    members: memberIds,
    manager: managerId,
    createdBy: req.user?._id
  };
  if (operationHeadId) teamData.operationHead = operationHeadId;
  const team = await Team.create(teamData);
  await ensureCrmTeamId(team);

  const memberUpdate = operationHeadId
    ? { $set: { teamId: team._id, team: name, managerId, operationHeadId } }
    : { $set: { teamId: team._id, team: name, managerId }, $unset: { operationHeadId: '' } };
  await User.updateMany(
    { _id: { $in: memberIds } },
    memberUpdate
  );
  await User.findByIdAndUpdate(
    managerId,
    operationHeadId
      ? { $set: { teamId: team._id, team: name, operationHeadId } }
      : { $set: { teamId: team._id, team: name }, $unset: { operationHeadId: '' } }
  );
  if (operationHeadId) await User.findByIdAndUpdate(operationHeadId, { $set: { teamId: team._id, team: name } });
  const ccpSync = await syncTeamToCcp(team, { action: 'create' });
  if (ccpSync.ok === false) console.error('CCP team sync failed', ccpSync);
  await saveSyncedCcpTeamId(team, ccpSync);

  const populated = await Team.findById(team._id)
    .populate('members', 'name email role avatarUrl isActive')
    .populate('manager', 'name email role avatarUrl isActive')
    .populate('operationHead', 'name email role avatarUrl isActive')
    .lean();

  res.status(201).json({ ok: true, team: mapTeam(populated), ccpSync });
};

exports.listTeamsForCcp = async (req, res) => {
  const teams = await Team.find()
    .populate('members', 'crmUserId ccpUserId name email role avatarUrl isActive')
    .populate('manager', 'crmUserId ccpUserId name email role avatarUrl isActive')
    .populate('operationHead', 'crmUserId ccpUserId name email role avatarUrl isActive')
    .sort({ name: 1 })
    .lean();

  res.json({ ok: true, teams: teams.map(mapTeam) });
};

exports.syncTeamFromCcp = async (req, res) => {
  const action = String(req.body.action || '').trim().toLowerCase();
  const ccpTeamId = String(req.body.ccpTeamId || req.body.id || req.body._id || '').trim();
  const crmTeamId = String(req.body.crmTeamId || '').trim();
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const source = String(req.body.source || 'ccp').trim() || 'ccp';

  if (!['create', 'update'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!ccpTeamId) return res.status(400).json({ error: 'ccpTeamId is required' });
  if (!name) return res.status(400).json({ error: 'Team name is required' });

  const memberIds = await resolveCcpUserIds(req.body.members);
  const managerId = await resolveCcpUserId(req.body.managerId || req.body.manager);
  const operationHeadId = await resolveCcpUserId(req.body.operationHeadId || req.body.operationHead);

  if (!managerId) return res.status(400).json({ error: 'Manager could not be resolved from ccpUserId' });

  let team = await Team.findOne({ ccpTeamId });
  const teamByName = await Team.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (team && teamByName && String(team._id) !== String(teamByName._id)) {
    return res.status(409).json({ error: 'Team name already belongs to another CRM team' });
  }
  if (!team) team = teamByName;

  if (team) {
    team.name = name;
    team.description = description;
    team.members = memberIds.map(readObjectId).filter(Boolean);
    team.manager = managerId;
    team.operationHead = operationHeadId;
    team.ccpTeamId = ccpTeamId;
    team.crmTeamId = team.crmTeamId || crmTeamId || String(team._id);
    team.source = source;
    await team.save();
    await applyTeamToUsers(team);
    const populated = await Team.findById(team._id)
      .populate('members', 'name email role avatarUrl isActive')
      .populate('manager', 'name email role avatarUrl isActive')
      .populate('operationHead', 'name email role avatarUrl isActive')
      .lean();
    return res.json({ ok: true, crmTeamId: team.crmTeamId || String(team._id), team: mapTeam(populated) });
  }

  const createdTeam = await Team.create({
    crmTeamId: crmTeamId || undefined,
    ccpTeamId,
    source,
    name,
    description,
    members: memberIds.map(readObjectId).filter(Boolean),
    manager: managerId,
    operationHead: operationHeadId
  });
  await ensureCrmTeamId(createdTeam);
  await applyTeamToUsers(createdTeam);

  const populated = await Team.findById(createdTeam._id)
    .populate('members', 'name email role avatarUrl isActive')
    .populate('manager', 'name email role avatarUrl isActive')
    .populate('operationHead', 'name email role avatarUrl isActive')
    .lean();

  return res.status(201).json({ ok: true, crmTeamId: createdTeam.crmTeamId || String(createdTeam._id), team: mapTeam(populated) });
};
