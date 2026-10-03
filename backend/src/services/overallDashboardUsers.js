const { buildOverall } = require('./overallDashboard');
const { createOverallServiceVisibility } = require('./overallDashboardVisibility');
const { userHasAnyRole } = require('../utils/userRoles');

function eligibleOperationsUsers(users, teams = []) {
  const eligible = users.filter((user) => !userHasAnyRole(user, ['superadmin', 'sales'])
    && String(user.name || '').trim().toLowerCase().replace(/\s+/g, ' ') !== 'himanshu parashar');
  const operators = eligible.filter((user) => userHasAnyRole(user, ['operation', 'operations']));
  const operatorIds = new Set(operators.map((user) => String(user._id)));
  const operatorTeams = new Set(operators.map((user) => String(user.teamId || '')).filter(Boolean));
  const managerIds = new Set(operators.map((user) => String(user.managerId || '')).filter(Boolean));
  teams.forEach((team) => {
    if (operatorTeams.has(String(team._id)) || (team.members || []).some((id) => operatorIds.has(String(id)))) {
      if (team.manager) managerIds.add(String(team.manager));
    }
  });
  return eligible.filter((user) => operatorIds.has(String(user._id)) || (userHasAnyRole(user, ['manager']) && managerIds.has(String(user._id))));
}

// Users are already restricted to the requester's authorized scope by the controller.
// Apply the same service ownership rules as the main dashboard, never lead-wide totals.
function buildUserSections(records, deactivations, users, teams = []) {
  return eligibleOperationsUsers(users, teams).map((user) => {
    const id = String(user._id);
    const scope = { ids: [id], identities: [id, user.crmUserId, user.name, user.email].filter(Boolean) };
    const matches = createOverallServiceVisibility(scope);
    const owned = records.filter((record) => (record.owners || []).some((owner) => matches({}, {
      createdBy: owner.id, createdByCrmUserId: owner.crmId, createdByName: owner.name, createdByEmail: owner.email
    }, {})));
    return { userId: id, userName: user.name || user.email || 'Unnamed user', role: user.role, yearSections: buildOverall(owned, deactivations).yearSections };
  });
}
module.exports = { buildUserSections, eligibleOperationsUsers };
