// Keep file proofs, screenshots, client forms and quotation PDFs out of analytics.
// In particular, poFileUrl may contain an entire base64 document. Evaluate proof
// presence in MongoDB instead of transferring the document to the application.
function overallPipeline(filter = {}) {
  return [
    { $match: filter },
    { $project: {
      company: 1, companyName: 1, companyIdentity: 1, applicantType: 1, subApplicantType: 1,
      piboCategory: 1, closedAt: 1, closedBy: 1,
      serviceSelections: { $map: { input: { $ifNull: ['$serviceSelections', []] }, as: 'service', in: {
        applicantType: '$$service.applicantType', piboParent: '$$service.piboParent',
        subApplicantType: '$$service.subApplicantType', piboCategory: '$$service.piboCategory',
        servicesOffered: '$$service.servicesOffered', applicableService: '$$service.applicableService'
      } } },
      assignments: { $map: { input: { $ifNull: ['$assignments', []] }, as: 'assignment', in: {
        closedAt: '$$assignment.closedAt', closedBy: '$$assignment.closedBy', closedByText: '$$assignment.closedByText',
        servicesOffered: '$$assignment.servicesOffered',
        poYearRows: { $map: { input: { $ifNull: ['$$assignment.poYearRows', []] }, as: 'po', in: {
          fy: '$$po.fy',
          hasPoEvidence: { $or: [
            { $ne: [{ $ifNull: ['$$po.poNumber', ''] }, ''] },
            { $ne: [{ $ifNull: ['$$po.poFileUrl', ''] }, ''] }
          ] },
          services: { $map: { input: { $ifNull: ['$$po.services', []] }, as: 'item', in: {
            $cond: [{ $eq: [{ $type: '$$item' }, 'string'] }, '$$item', {
              name: { $ifNull: ['$$item.name', { $ifNull: ['$$item.label', { $ifNull: ['$$item.servicesOffered', '$$item.applicableService'] }] }] }
            }]
          } } }
        } } }
      } } }
    } }
  ];
}
const serviceName = (value) => typeof value === 'string' ? value.trim() : String(value?.name || value?.label || value?.servicesOffered || value?.applicableService || '').trim();
function overallRecordsFromLeads(leads) {
  const records = [];
  for (const lead of leads) {
    for (const [index, assignment] of (lead.assignments || []).entries()) {
      const service = lead.serviceSelections?.[index] || {};
      const isClosed = Boolean(assignment.closedAt || assignment.closedBy || assignment.closedByText
        || (lead.serviceSelections?.length === 1 && (lead.closedAt || lead.closedBy)));
      if (!isClosed) continue;
      for (const po of assignment.poYearRows || []) {
        if (!po.hasPoEvidence) continue;
        const names = (po.services || []).map(serviceName).filter(Boolean);
        if (!names.length) { const fallback = serviceName(service.servicesOffered || service.applicableService || assignment.servicesOffered); if (fallback) names.push(fallback); }
        records.push({
          leadId: String(lead._id), companyIdentity: lead.companyIdentity || '',
          clientName: lead.company || lead.companyName || 'Untitled client', financialYear: po.fy,
          applicantType: service.applicantType || service.piboParent || lead.applicantType || 'Not specified',
          subApplicantType: service.subApplicantType || service.piboCategory || lead.subApplicantType || lead.piboCategory || 'Not specified',
          isClosed: true, services: names.map((name) => ({ name }))
        });
      }
    }
  }
  return records;
}
async function loadOverallRecords(Lead, filter) {
  const leads = await Lead.aggregate(overallPipeline(filter)).option({ maxTimeMS: 12000 });
  return overallRecordsFromLeads(leads);
}
function createOverallCache({ ttl = 30000, maxEntries = 50, now = Date.now } = {}) {
  const entries = new Map();
  return async (key, load) => {
    const current = entries.get(key);
    if (current && (current.loading || current.expiresAt > now())) return current.promise;
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
    const entry = { loading: true };
    entry.promise = Promise.resolve().then(load).then((records) => {
      entry.loading = false; entry.expiresAt = now() + ttl; return records;
    }, (error) => { if (entries.get(key) === entry) entries.delete(key); throw error; });
    entries.set(key, entry);
    return entry.promise;
  };
}
module.exports = { overallPipeline, overallRecordsFromLeads, loadOverallRecords, createOverallCache };
