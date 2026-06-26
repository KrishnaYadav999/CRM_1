const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const { ADMIN_ROLES } = require('../constants/roles');

function asObjectId(value) {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function cleanIdentity(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildIdentityConditions(paths, identities) {
  if (!paths.length || !identities.length) return [];

  return paths.flatMap((path) => identities.map((identity) => ({
    [path]: { $regex: `^${escapeRegex(identity)}$`, $options: 'i' }
  })));
}

async function getVisibleUserScope(user) {
  if (!user?._id) return { ids: [], identities: [] };
  if (ADMIN_ROLES.includes(user.role)) return null;

  const ownId = asObjectId(user._id);
  const usersById = new Map();
  usersById.set(String(user._id), user);

  const members = await User.find({
    isActive: true,
    $or: [
      { managerId: user._id },
      { operationHeadId: user._id },
      { _id: user._id }
    ]
  }).select('_id name email ccpUserId').lean();
  members.forEach((member) => usersById.set(String(member._id), member));

  const managedTeams = await Team.find({
    $or: [
      { manager: user._id },
      { operationHead: user._id }
    ]
  }).select('members manager operationHead').lean();
  const teamUserIds = managedTeams.flatMap((team) => [
    team.manager,
    team.operationHead,
    ...(Array.isArray(team.members) ? team.members : [])
  ]).map((id) => String(id || '')).filter(Boolean);

  if (teamUserIds.length) {
    const teamUsers = await User.find({ isActive: true, _id: { $in: teamUserIds } })
      .select('_id name email ccpUserId')
      .lean();
    teamUsers.forEach((member) => usersById.set(String(member._id), member));
  }

  const ids = [...usersById.keys()].map(asObjectId).filter(Boolean);
  if (!ids.length && ownId) ids.push(ownId);

  const names = new Set();
  usersById.forEach((visibleUser) => {
    const name = cleanIdentity(visibleUser.name);
    const email = cleanIdentity(visibleUser.email);
    const ccpUserId = cleanIdentity(visibleUser.ccpUserId);
    if (name) names.add(name);
    if (email) names.add(email);
    if (ccpUserId) names.add(ccpUserId);
  });

  return { ids, identities: [...names] };
}

async function getVisibleUserIds(user) {
  const scope = await getVisibleUserScope(user);
  if (scope === null) return null;
  return scope.ids;
}

function ownerFilter(scope, createdByPath = 'createdBy', assignedToPath = 'assignedTo', identityPaths = []) {
  if (scope === null) return {};

  const ids = Array.isArray(scope) ? scope : (scope?.ids || []);
  const identities = Array.isArray(scope) ? [] : (scope?.identities || []);
  const conditions = [
    ...(ids.length ? [
      { [createdByPath]: { $in: ids } },
      { [assignedToPath]: { $in: ids } }
    ] : []),
    ...buildIdentityConditions(identityPaths, identities)
  ];

  if (!conditions.length) return { _id: { $exists: false } };

  return { $or: conditions };
}

module.exports = {
  getVisibleUserScope,
  getVisibleUserIds,
  ownerFilter
};
