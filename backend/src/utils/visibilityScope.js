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
  // CRM records are a shared working catalog. Authentication controls read access;
  // role and ownership checks continue to control privileged actions and edits.
  return null;
}

const User = require('../models/User');
const ADMIN_ROLES = new Set(['admin', 'superadmin']);
const MANAGER_ROLES = new Set(['manager', 'management', 'team manager']);

function userIdentities(user = {}) {
  return [...new Set([user._id, user.id, user.crmUserId, user.userId, user.email, user.name]
    .filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

async function getLeadVisibleUserScope(user) {
  if (!user?._id) return { ids: [], identities: [] };
  const role = String(user.role || '').trim().toLowerCase();
  if (ADMIN_ROLES.has(role)) return null;

  const people = [user];
  if (MANAGER_ROLES.has(role)) {
    const reports = await User.find({ managerId: user._id, isActive: { $ne: false } })
      .select('_id crmUserId name email').lean();
    people.push(...reports);
  }
  return {
    ids: [...new Set(people.flatMap((person) => [person._id, person.id]).filter(Boolean).map(String))],
    identities: [...new Set(people.flatMap(userIdentities))]
  };
}

async function getVisibleUserIds(user) {
  const scope = await getVisibleUserScope(user);
  if (scope === null) return null;
  return scope.ids;
}

function ownerFilter(scope, createdByPath = 'createdBy', assignedToPath = 'assignedTo', identityPaths = [], additionalIdPaths = []) {
  if (scope === null) return {};

  const ids = Array.isArray(scope) ? scope : (scope?.ids || []);
  const identities = Array.isArray(scope) ? [] : (scope?.identities || []);
  const conditions = [
    ...(ids.length ? [
      { [createdByPath]: { $in: ids } },
      { [assignedToPath]: { $in: ids } },
      ...additionalIdPaths.map((path) => ({ [path]: { $in: ids } }))
    ] : []),
    ...buildIdentityConditions(identityPaths, identities)
  ];

  if (!conditions.length) return { _id: { $exists: false } };

  return { $or: conditions };
}

module.exports = {
  getVisibleUserScope,
  getLeadVisibleUserScope,
  getVisibleUserIds,
  ownerFilter
};
