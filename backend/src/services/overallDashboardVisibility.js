const { ownerFilter } = require('../utils/visibilityScope');
const text = (value) => String(value?._id || value?.id || value || '').trim().toLowerCase();

function overallLeadFilter(scope) {
  return ownerFilter(scope, 'createdBy', 'assignedTo', [
    'createdByCrmUserId', 'createdByEmail', 'createdByName', 'importedCreatedBy',
    'generatedForName', 'generatedForEmail', 'createdOnBehalfOfName', 'createdOnBehalfOfEmail',
    'assignedToText', 'assignedStaffText', 'assignedStaffEmail',
    'assignments.assignedToText', 'assignments.assignedToEmail',
    'assignments.assignedStaffText', 'assignments.assignedStaffEmail',
    'serviceSelections.createdByCrmUserId', 'serviceSelections.createdByEmail', 'serviceSelections.createdByName'
  ], ['generatedForUser', 'createdOnBehalfOfUser', 'assignedStaff', 'assignments.assignedTo', 'assignments.assignedStaff', 'serviceSelections.createdBy']);
}

function createOverallServiceVisibility(scope) {
  if (scope === null) return () => true;
  const ids = new Set((scope?.ids || []).map(text));
  const identities = new Set((scope?.identities || []).map(text));
  const hasOwner = (owner) => Object.values(owner).some((value) => Boolean(text(value)));
  const matches = (owner) => {
    // Stable ids take priority over names: two employees can share a name.
    if (text(owner.id)) return ids.has(text(owner.id));
    if (text(owner.crmId)) return identities.has(text(owner.crmId)) || ids.has(text(owner.crmId));
    if (text(owner.email)) return identities.has(text(owner.email));
    return Boolean(text(owner.name)) && identities.has(text(owner.name));
  };
  return (lead, service, assignment) => {
    const owners = [
      { id: service.createdBy, crmId: service.createdByCrmUserId, email: service.createdByEmail, name: service.createdByName },
      { id: assignment.assignedTo, email: assignment.assignedToEmail, name: assignment.assignedToText },
      { id: assignment.assignedStaff, email: assignment.assignedStaffEmail, name: assignment.assignedStaffText }
    ].filter(hasOwner);
    if (owners.length) return owners.some(matches);

    // Legacy rows without service ownership inherit the lead's assignment or
    // permanent creator. Leads generated on behalf of a user belong to that user.
    const creator = hasOwner({ id: lead.generatedForUser, email: lead.generatedForEmail, name: lead.generatedForName })
      ? { id: lead.generatedForUser, email: lead.generatedForEmail, name: lead.generatedForName }
      : hasOwner({ id: lead.createdOnBehalfOfUser, email: lead.createdOnBehalfOfEmail, name: lead.createdOnBehalfOfName })
        ? { id: lead.createdOnBehalfOfUser, email: lead.createdOnBehalfOfEmail, name: lead.createdOnBehalfOfName }
        : { id: lead.createdBy, crmId: lead.createdByCrmUserId, email: lead.createdByEmail, name: lead.createdByName || lead.importedCreatedBy };
    return [creator,
      { id: lead.assignedTo, name: lead.assignedToText },
      { id: lead.assignedStaff, email: lead.assignedStaffEmail, name: lead.assignedStaffText }
    ].filter(hasOwner).some(matches);
  };
}
module.exports = { overallLeadFilter, createOverallServiceVisibility };
