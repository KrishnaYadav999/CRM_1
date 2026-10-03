const { buildOverall } = require('./overallDashboard');
const { createOverallServiceVisibility } = require('./overallDashboardVisibility');

// Users are already restricted to the requester's authorized scope by the controller.
// Apply the same service ownership rules as the main dashboard, never lead-wide totals.
function buildUserSections(records, deactivations, users) {
  return users.map((user) => {
    const id = String(user._id);
    const scope = { ids: [id], identities: [id, user.crmUserId, user.name, user.email].filter(Boolean) };
    const matches = createOverallServiceVisibility(scope);
    const owned = records.filter((record) => (record.owners || []).some((owner) => matches({}, {
      createdBy: owner.id, createdByCrmUserId: owner.crmId, createdByName: owner.name, createdByEmail: owner.email
    }, {})));
    return { userId: id, userName: user.name || user.email || 'Unnamed user', role: user.role, yearSections: buildOverall(owned, deactivations).yearSections };
  });
}
module.exports = { buildUserSections };
