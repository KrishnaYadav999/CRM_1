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
