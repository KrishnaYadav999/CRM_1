function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function firstIdentity(source = {}, fields = []) {
  for (const field of fields) {
    const value = normalizeIdentity(source?.[field]);
    if (value) return value;
  }
  return '';
}

function serviceIdentity(source = {}) {
  return {
    applicant: firstIdentity(source, ['subApplicantType', 'piboCategory', 'applicantType', 'piboParent', 'piboCategoryParent']),
    category: firstIdentity(source, ['eprCategory', 'serviceCategory']),
    offering: firstIdentity(source, ['servicesOffered', 'applicableService']),
    business: firstIdentity(source, ['businessCategory']),
    year: firstIdentity(source, ['servicesForYear', 'financialYear', 'firstAnnualReturnYearApplicable'])
  };
}

function legacyItemMatchesService(item = {}, service = {}) {
  const target = serviceIdentity(service);
  const candidate = serviceIdentity(item);
  const comparable = Object.keys(target).filter((key) => target[key] && candidate[key]);
  if (!comparable.length) return false;
  if (comparable.some((key) => target[key] !== candidate[key])) return false;

  // Applicant type is the service boundary for PIBO leads. Never allow a
  // Producer closure to borrow an Importer quotation merely because another
  // field or the array position happens to match.
  if (target.applicant && candidate.applicant && target.applicant !== candidate.applicant) return false;
  return comparable.length >= 2 || (target.applicant && target.applicant === candidate.applicant);
}

function quotationTime(quotation = {}) {
  const value = quotation.updatedAt || quotation.createdAt || quotation.quotationDate || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Select the quotation that actually contains the clicked lead service.
 * Exact assigned-service IDs are authoritative. Identity matching exists only
 * for legacy quotations saved before those IDs were persisted.
 */
export function selectLeadClosureQuotation(quotations = [], { service = {}, assignment = {}, serviceIndex = -1 } = {}) {
  const ordered = [...(Array.isArray(quotations) ? quotations : [])]
    .sort((left, right) => quotationTime(right) - quotationTime(left));
  const serviceIds = new Set([service.assignedServiceId, assignment.assignedServiceId, service.serviceAssignmentId, assignment.serviceAssignmentId]
    .map((value) => String(value || '').trim())
    .filter(Boolean));

  if (serviceIds.size) {
    for (const quotation of ordered) {
      const items = (Array.isArray(quotation?.items) ? quotation.items : [])
        .filter((item) => serviceIds.has(String(item?.assignedServiceId || '').trim()));
      if (items.length) return { quotation, items, matchType: 'assigned-service-id' };
    }
  }

  for (const quotation of ordered) {
    const compatibleItems = (Array.isArray(quotation?.items) ? quotation.items : [])
      .filter((item) => legacyItemMatchesService(item, service));
    if (!compatibleItems.length) continue;

    const indexedItem = compatibleItems.find((item) => Number.isInteger(Number(item?.sourceServiceIndex))
      && Number(item.sourceServiceIndex) === Number(serviceIndex));
    return {
      quotation,
      items: indexedItem ? [indexedItem] : compatibleItems,
      matchType: indexedItem ? 'legacy-identity-and-index' : 'legacy-identity'
    };
  }

  return { quotation: null, items: [], matchType: 'none' };
}
