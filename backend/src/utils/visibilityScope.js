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
  if (ADMIN_ROLES.includes(String(user.role || '').trim().toLowerCase())) return null;

  const ownId = asObjectId(user._id);
  const ids = new Set();
  const identities = new Set();

  if (ownId) ids.add(ownId);
  [user._id, user.name, user.email, user.ccpUserId].forEach((value) => {
    const normalized = cleanIdentity(value);
    if (normalized) identities.add(normalized);
  });

  const subordinateUsers = await User.find({
    isActive: true,
    $or: [
      { managerId: user._id },
      { operationHeadId: user._id }
    ]
  }).select('_id name email ccpUserId').lean();

  subordinateUsers.forEach((member) => {
    const memberId = asObjectId(member._id);
    if (memberId) ids.add(memberId);
    [member.name, member.email, member.ccpUserId].forEach((value) => {
      const normalized = cleanIdentity(value);
      if (normalized) identities.add(normalized);
    });
  });

  const managedTeams = await Team.find({
    $or: [
      { manager: user._id },
      { operationHead: user._id }
    ]
  }).select('members manager operationHead').lean();

  managedTeams.forEach((team) => {
    (Array.isArray(team.members) ? team.members : []).forEach((memberId) => {
      const objectId = asObjectId(memberId);
      if (objectId) ids.add(objectId);
    });
  });

  return {
    ids: [...ids],
    identities: [...identities]
  };
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
