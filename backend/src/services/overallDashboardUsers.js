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

const identity = (value) => {
  if (!value) return [];
  if (typeof value === 'object') return [value._id, value.id, value.userId, value.crmUserId, value.email, value.name]
    .map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
  return [String(value).trim().toLowerCase()].filter(Boolean);
};

function allocatedOwnerKeyGroups(client = {}) {
  const data = client.data && typeof client.data === 'object' ? client.data : {};
  const lead = client.selectedLead && typeof client.selectedLead === 'object'
    ? client.selectedLead
    : (data.selectedLeadSnapshot && typeof data.selectedLeadSnapshot === 'object' ? data.selectedLeadSnapshot : {});
  const serviceId = String(client.assignedServiceId || data.assignedServiceId || data.selectedLeadSnapshot?.assignedServiceId || '');
  const assignments = (Array.isArray(lead.assignments) ? lead.assignments : [])
    .filter((assignment) => !serviceId || String(assignment?.assignedServiceId || assignment?.serviceAssignmentId || '') === serviceId);
  const admin = client.adminControls || data.adminControls || {};
  const importMeta = data.importMeta || {};
  const allocations = client.serviceAllocations || data.serviceAllocations || {};
  const allocationValues = Object.values(allocations).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return identity(entry);
    return [entry.userId, entry.userIdString, entry.user, entry.assignedTo, entry.assigneeId,
      entry.assignedUserId, entry._id, entry.id, entry.value, entry.userName, entry.email].flatMap(identity);
  });
  const permanent = [...new Set([
    lead.assignedStaff, lead.assignedStaffText, lead.assignedStaffEmail,
    client.assignedStaff, client.assignedStaffText, client.assignedStaffEmail,
    ...assignments.flatMap((assignment) => [assignment?.assignedStaff, assignment?.assignedStaffText, assignment?.assignedStaffEmail])
  ].flatMap(identity))];
  const fallback = [...new Set([
    admin.assignedTo, admin.assignedUser, admin.user, admin.userId, admin.managerId,
    importMeta.assignedTo, importMeta.user, importMeta.userName,
    client.assignedTo, client.assignedUser, client.userName, client.user,
    ...[lead, ...assignments].flatMap((owner) => [owner?.assignedTo, owner?.assignedToText, owner?.assignedToEmail]),
    ...allocationValues
  ].flatMap(identity))];
  return [permanent, fallback];
}

function buildAllocatedClientCounts(clients = [], users = [], teams = []) {
  const eligible = eligibleOperationsUsers(users, teams);
  const userKeys = eligible.map((user) => ({
    id: String(user._id),
    keys: new Set([user._id, user.id, user.userId, user.crmUserId, user.email, user.name].flatMap(identity))
  }));
  const counts = Object.fromEntries(userKeys.map((user) => [user.id, 0]));
  const seen = new Set();
  clients.forEach((client, index) => {
    const clientKey = String(client?._id || client?.id || `row-${index}`);
    if (seen.has(clientKey)) return;
    seen.add(clientKey);
    const owner = allocatedOwnerKeyGroups(client)
      .map((ownerKeys) => userKeys.find((user) => ownerKeys.some((key) => user.keys.has(key))))
      .find(Boolean);
    if (owner) counts[owner.id] += 1;
  });
  return counts;
}

// Users are already restricted to the requester's authorized scope by the controller.
// Apply the same service ownership rules as the main dashboard, never lead-wide totals.
function buildUserSections(records, deactivations, users, teams = [], allocatedClients = []) {
  const allocatedCounts = buildAllocatedClientCounts(allocatedClients, users, teams);
  return eligibleOperationsUsers(users, teams).map((user) => {
    const id = String(user._id);
    const scope = { ids: [id], identities: [id, user.crmUserId, user.name, user.email].filter(Boolean) };
    const matches = createOverallServiceVisibility(scope);
    const owned = records.filter((record) => (record.owners || []).some((owner) => matches({}, {
      createdBy: owner.id, createdByCrmUserId: owner.crmId, createdByName: owner.name, createdByEmail: owner.email
    }, {})));
    const ownedClientCount = new Set(owned.map((record) => String(record.companyIdentity || record.clientName || record.leadId || '').trim().toLowerCase()).filter(Boolean)).size;
    return { userId: id, userName: user.name || user.email || 'Unnamed user', role: user.role, allocatedClients: Math.max(allocatedCounts[id] || 0, ownedClientCount), yearSections: buildOverall(owned, deactivations).yearSections };
  });
}
module.exports = { buildUserSections, eligibleOperationsUsers, buildAllocatedClientCounts };
