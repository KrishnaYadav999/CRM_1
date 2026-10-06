const { createHash } = require('node:crypto');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const label = (key) => String(key).replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const ignored = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'savedAt', 'updatedBy', 'createdBy', 'approvalWorkflow', 'reviewHistory', 'original']);
function flatten(value, path = [], result = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const url = value.secureUrl || value.url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      result.push({ key: JSON.stringify(path), label: path.map(label).join(' · '), value: value.name || value.fileName || 'Supporting document', url });
    } else {
      Object.keys(value).sort().filter((key) => !ignored.has(key) && !key.startsWith('__')).forEach((key) => flatten(value[key], [...path, key], result));
    }
  } else if (Array.isArray(value) && value.length) {
    value.forEach((entry, index) => flatten(entry, [...path, `Row ${index + 1}`], result));
  } else {
    result.push({ key: JSON.stringify(path), label: path.map(label).join(' · '), value: Array.isArray(value) ? 'No entries' : value ?? '', ...(typeof value === 'string' && /^https?:\/\//i.test(value) ? { url: value } : {}) });
  }
  return result;
}
function buildSections({ draft = {}, purchase = null, sales = null, purchaseRows = [], salesRows = [] }) {
  const groups = new Map();
  const names = { basic: 'Basic Info', financials: 'Financial Details', data: 'Data Compliance', brandOwner: 'Brand Owner', importer: 'Importer', annual: 'Annual Filing', cpcbLetter: 'CPCB Letter', purchaseOrderConfirmation: 'Purchase Order Confirmation' };
  Object.keys(draft).sort().filter((key) => !ignored.has(key) && !key.startsWith('__')).forEach((key) => {
    const prefix = key.split('.')[0];
    const group = names[prefix] ? prefix : 'details';
    if (!groups.has(group)) groups.set(group, { key: `annual:${group}`, label: names[group] || 'Annual Return Details', fields: [] });
    groups.get(group).fields.push(...flatten(draft[key], [key]));
  });
  const sections = [...groups.values()];
  for (const [key, data, rows] of [['purchase', purchase, purchaseRows], ['sales', sales, salesRows]]) {
    if (!data && !rows.length) continue;
    const source = data ? Object.fromEntries(['checklist', 'screenshots', 'userRemarks', 'baseUpload', 'portalUpload', 'reconciliation'].map((name) => [name, data[name]])) : {};
    sections.push({ key, label: `${label(key)} Data`, fields: flatten({ ...source, importedRows: rows }, [key]) });
  }
  return sections.filter((section) => section.fields.length).map((section) => ({ ...section, fields: section.fields.map((field) => {
    const key = JSON.stringify([section.key, field.key]);
    return { ...field, key, fingerprint: hash([key, field.value, field.url || '']) };
  }) }));
}
function reviewState(sections, review = {}) {
  const saved = new Map((review.fields || []).map((field) => [field.key, field]));
  const sourceFingerprint = hash(sections.map((section) => [section.key, section.fields.map((field) => field.fingerprint)]));
  const enriched = sections.map((section) => ({ ...section, fields: section.fields.map((field) => {
    const previous = saved.get(field.key);
    const current = previous?.fingerprint === field.fingerprint;
    return { ...field, review: current ? previous : { status: 'NOT_REVIEWED', remarks: '', stale: Boolean(previous) } };
  }) }));
  const fields = enriched.flatMap((section) => section.fields);
  const verified = fields.filter((field) => field.review.status === 'VERIFIED').length;
  const reviewed = fields.filter((field) => field.review.status !== 'NOT_REVIEWED').length;
  return { sections: enriched, sourceFingerprint, status: review.sourceFingerprint && review.sourceFingerprint !== sourceFingerprint ? 'IN_REVIEW' : review.status || 'PENDING', progress: { total: fields.length, verified, reviewed, issues: reviewed - verified, percentage: fields.length ? Math.round(verified / fields.length * 100) : 0 } };
}
function validateDecision(decision, remarks, state) {
  if (!['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(decision)) return 'Select Approve, Reject or Partially Approve.';
  if (typeof remarks !== 'string' || !remarks.trim() || remarks.length > 2000) return 'Enter final remarks (up to 2000 characters).';
  if (!state.progress.total) return 'No annual-return data is available for review.';
  if (state.progress.reviewed !== state.progress.total) return 'Review every field before making the final decision.';
  if (decision === 'APPROVED' && state.progress.verified !== state.progress.total) return 'Verify every field before approving.';
  if (decision === 'PARTIALLY_APPROVED' && (!state.progress.verified || state.progress.verified === state.progress.total)) return 'Partial approval requires both verified fields and fields requiring changes.';
  return '';
}
module.exports = { buildSections, reviewState, validateDecision };
