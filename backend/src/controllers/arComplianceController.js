const mongoose = require('mongoose');
const Client = require('../models/Client');
const AnnualReturn = require('../models/AnnualReturn');
const PurchaseData = require('../models/PurchaseData');
const SalesData = require('../models/SalesData');
const PurchaseRows = require('../models/PurchaseImportRow');
const SalesRows = require('../models/SalesImportRow');
const Review = require('../models/ArComplianceReview');
const { buildSections, reviewState, validateDecision } = require('../services/arCompliance');
const yearKey = (value) => String(value || '').replace(/^FY\s*/i, '').trim();
const nameOf = (client) => client.data?.basic?.clientLegalName || client.data?.basic?.tradeName || client.selectedLead?.company || 'Client';
// These handlers are restricted to CLIENT_APPROVAL_ROLES at the router.
// Compliance needs the complete review queue, including clients owned by operations.
async function source(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return null;
  const client = await Client.findOne({ _id: req.params.id }).populate('selectedLead', 'company leadCode').lean();
  if (!client) return null;
  const records = await AnnualReturn.find({ client: client._id }).sort({ updatedAt: 1, _id: 1 }).lean();
  const filings = Object.assign({}, ...records.map((record) => ({ ...(record.filings || {}), ...(record.annualYear ? { [record.annualYear]: { draft: record.draft || {} } } : {}) })), client.data?.annualReturn?.filings || {});
  const [purchaseYears, salesYears] = await Promise.all([PurchaseData.distinct('financialYear', { clientId: client._id }), SalesData.distinct('financialYear', { clientId: client._id })]);
  const years = [...new Set([...Object.keys(filings), ...purchaseYears, ...salesYears].map(yearKey))].filter(Boolean).sort().reverse();
  const financialYear = yearKey(req.query.financialYear || req.body?.financialYear || years[0]);
  if (!years.includes(financialYear)) return { client, years, financialYear: '', sections: [] };
  const filter = { clientId: client._id, financialYear };
  const [purchase, sales, purchaseRows, salesRows] = await Promise.all([
    PurchaseData.findOne(filter).lean(), SalesData.findOne(filter).lean(),
    PurchaseRows.find(filter).select('-original -createdBy -createdAt -updatedAt -__v -clientId -financialYear -uploadId').sort({ source: 1, rowNumber: 1, _id: 1 }).lean(),
    SalesRows.find(filter).select('-original -createdBy -createdAt -updatedAt -__v -clientId -financialYear -uploadId').sort({ source: 1, rowNumber: 1, _id: 1 }).lean()
  ]);
  const filing = Object.entries(filings).find(([key]) => yearKey(key) === financialYear)?.[1];
  return { client, years, financialYear, sections: buildSections({ draft: filing?.draft || {}, purchase, sales, purchaseRows, salesRows }) };
}
async function load(req) {
  const data = await source(req);
  if (!data) return null;
  const review = data.financialYear ? await Review.findOne({ client: data.client._id, financialYear: data.financialYear }).lean() : null;
  return { ...data, review: review || {}, ...reviewState(data.sections, review || {}) };
}
function publicPayload(data) {
  return { client: { _id: data.client._id, name: nameOf(data.client), code: data.client.data?.importMeta?.uniqueId || data.client.selectedLead?.leadCode || '-' }, years: data.years, financialYear: data.financialYear, sections: data.sections, progress: data.progress, sourceFingerprint: data.sourceFingerprint, status: data.status, finalRemarks: data.review.finalRemarks || '', decidedAt: data.review.decidedAt || null };
}
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
exports.list = wrap(async (req, res) => {
  const clients = await Client.find({}).select('data.basic data.importMeta data.annualReturn.filings selectedLead').populate('selectedLead', 'company').lean();
  const ids = clients.map((client) => client._id);
  const [annuals, purchases, sales, reviews] = await Promise.all([
    AnnualReturn.find({ client: { $in: ids } }).select('client annualYear filings savedAt').lean(),
    PurchaseData.find({ clientId: { $in: ids } }).select('clientId financialYear updatedAt').lean(),
    SalesData.find({ clientId: { $in: ids } }).select('clientId financialYear updatedAt').lean(),
    Review.find({ client: { $in: ids } }).populate('decidedBy', 'name email').lean()
  ]);
  const rows = clients.flatMap((client) => {
    const same = (id) => String(id) === String(client._id);
    const years = new Set(Object.keys(client.data?.annualReturn?.filings || {}).map(yearKey));
    annuals.filter((row) => same(row.client)).forEach((row) => [row.annualYear, ...Object.keys(row.filings || {})].filter(Boolean).forEach((year) => years.add(yearKey(year))));
    [...purchases, ...sales].filter((row) => same(row.clientId)).forEach((row) => years.add(yearKey(row.financialYear)));
    return [...years].filter(Boolean).map((financialYear) => {
      const review = reviews.find((row) => same(row.client) && row.financialYear === financialYear);
      const changedAt = [
        ...Object.entries(client.data?.annualReturn?.filings || {}).filter(([year]) => yearKey(year) === financialYear).map(([, filing]) => filing.savedAt),
        ...annuals.filter((row) => same(row.client)).flatMap((row) => [yearKey(row.annualYear) === financialYear ? row.savedAt : null, ...Object.entries(row.filings || {}).filter(([year]) => yearKey(year) === financialYear).map(([, filing]) => filing.savedAt)]),
        ...[...purchases, ...sales].filter((row) => same(row.clientId) && yearKey(row.financialYear) === financialYear).map((row) => row.updatedAt)
      ].filter(Boolean).some((date) => new Date(date).getTime() > new Date(review?.decidedAt || 0).getTime());
      const stale = review?.decidedAt && changedAt;
      return { clientId: client._id, clientName: nameOf(client), financialYear, status: stale ? 'IN_REVIEW' : review?.status || 'PENDING', decisionBy: review?.decidedBy?.name || review?.decidedBy?.email || '-', reviewedAt: review?.decidedAt || null };
    });
  });
  res.json({ rows });
});
exports.get = wrap(async (req, res) => {
  const data = await load(req);
  if (!data) return res.status(404).json({ error: 'Client not found or unavailable.' });
  res.json(publicPayload(data));
});
exports.saveField = wrap(async (req, res) => {
  const data = await load(req);
  if (!data) return res.status(404).json({ error: 'Client not found or unavailable.' });
  const field = data.sections.flatMap((section) => section.fields).find((item) => item.key === req.body.key);
  if (!field || field.fingerprint !== req.body.fingerprint) return res.status(409).json({ error: 'This field changed. Reload the saved data before reviewing it.' });
  const { status, remarks } = req.body;
  if (!['VERIFIED', 'CHANGES_REQUIRED'].includes(status) || typeof remarks !== 'string' || !remarks.trim() || remarks.length > 2000) return res.status(400).json({ error: 'Select a review status and enter field remarks (up to 2000 characters).' });
  try {
    await Review.updateOne({ client: data.client._id, financialYear: data.financialYear }, { $setOnInsert: { fields: [] } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error; // Another reviewer created this year's record first.
  }
  // Atomic replacement prevents simultaneous reviews of different fields from being lost.
  await Review.updateOne({ client: data.client._id, financialYear: data.financialYear }, [{ $set: {
    fields: { $concatArrays: [{ $filter: { input: '$fields', as: 'field', cond: { $ne: ['$$field.key', { $literal: field.key }] } } }, { $literal: [{ key: field.key, fingerprint: field.fingerprint, status, remarks: remarks.trim(), reviewedBy: req.user._id, reviewedAt: new Date() }] }] },
    status: 'IN_REVIEW', sourceFingerprint: data.sourceFingerprint, updatedAt: new Date(),
    history: { $concatArrays: [{ $ifNull: ['$history', []] }, { $literal: [{ action: 'FIELD_REVIEW', key: field.key, status, remarks: remarks.trim(), by: req.user._id, at: new Date() }] }] }
  } }]);
  res.json(publicPayload(await load(req)));
});
exports.decide = wrap(async (req, res) => {
  const data = await load(req);
  if (!data) return res.status(404).json({ error: 'Client not found or unavailable.' });
  if (data.sourceFingerprint !== req.body.sourceFingerprint) return res.status(409).json({ error: 'Saved data changed. Reload and review the changed fields.' });
  const error = validateDecision(req.body.decision, req.body.remarks, data);
  if (error) return res.status(400).json({ error });
  const result = await Review.updateOne({ client: data.client._id, financialYear: data.financialYear, updatedAt: data.review.updatedAt }, { $set: { status: req.body.decision, sourceFingerprint: data.sourceFingerprint, finalRemarks: req.body.remarks.trim(), decidedBy: req.user._id, decidedAt: new Date() }, $push: { history: { action: 'DECISION', status: req.body.decision, remarks: req.body.remarks.trim(), by: req.user._id, at: new Date() } } });
  if (!result.matchedCount) return res.status(409).json({ error: 'Another reviewer updated this review. Reload before deciding.' });
  res.json(publicPayload(await load(req)));
});
