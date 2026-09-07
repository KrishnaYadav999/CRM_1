function normalizeRole(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getUserRoles(user = {}) {
  const values = [user.role, ...(Array.isArray(user.roles) ? user.roles : [])];
  return [...new Set(values.map(normalizeRole).filter(Boolean))];
}

function normalizeRoleFamily(value) {
  return normalizeRole(value).replace(/-/g, '');
}

function userHasAnyRole(user, allowedRoles = []) {
  const userRoles = getUserRoles(user).map(normalizeRoleFamily);
  const allowed = allowedRoles.map(normalizeRoleFamily);
  return userRoles.some((role) => allowed.includes(role) || (allowed.includes('compliance') && role.includes('compliance')));
}

module.exports = { getUserRoles, normalizeRole, userHasAnyRole };
