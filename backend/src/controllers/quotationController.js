const Quotation = require('../models/Quotation');
const PendingApproval = require('../models/PendingApproval');
const QuotationServiceCategory = require('../models/QuotationServiceCategory');
const QuotationPiboCategory = require('../models/QuotationPiboCategory');
const QuotationSyncIssue = require('../models/QuotationSyncIssue');
const Lead = require('../models/Lead');

function normalizeApprovalStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  return ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : '';
}

const LEAD_DETAIL_FIELDS = [
  'referredBy',
  'salutation',
  'contactPerson',
  'designation',
  'mobileNo1',
  'mobileNo2',
  'companyName',
  'addressLine1',
  'addressLine2',
  'addressLine3',
  'state',
  'city',
  'pinCode',
  'gstNumber'
];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function cleanString(value) {
  return String(value || '').trim();
}

function cleanLeadDetails(value = {}) {
  return LEAD_DETAIL_FIELDS.reduce((data, field) => {
    data[field] = field === 'gstNumber' ? cleanString(value[field]).toUpperCase() : cleanString(value[field]);
    return data;
  }, {});
}

function validateGstNumber(value) {
  const gstNumber = cleanString(value).toUpperCase();
  if (!gstNumber) return '';
  if (gstNumber.length !== 15) return 'GST Number must contain exactly 15 characters';
  if (!GSTIN_PATTERN.test(gstNumber)) return 'Enter a valid 15-character GST Number';
  return '';
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: cleanString(item.id),
      serviceCategory: cleanString(item.serviceCategory),
      servicesForYear: cleanString(item.servicesForYear),
      eprCategory: cleanString(item.eprCategory),
      piboCategory: cleanString(item.piboCategory),
      unit: cleanString(item.unit),
      unitLabel: cleanString(item.unitLabel),
      basicAmount: Number(item.basicAmount) || 0
    }))
    .filter((item) => Object.values(item).some((value) => String(value || '').trim() !== '' && value !== 0));
}

function cleanTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms.map(cleanString).filter(Boolean);
}

function cleanBody(body) {
  const items = cleanItems(body.items);
  const calculatedTotal = items.reduce((sum, item) => sum + ((Number(item.unit) || 0) * (Number(item.basicAmount) || 0)), 0);
  return {
    leadId: cleanString(body.leadId),
    leadCode: cleanString(body.leadCode),
    leadDetails: cleanLeadDetails(body.leadDetails),
    validUntil: cleanString(body.validUntil),
    companyName: cleanString(body.companyName || body.leadDetails?.companyName),
    quotationDate: body.quotationDate || undefined,
    items,
    terms: cleanTerms(body.terms),
    subtotal: Number(body.subtotal) || calculatedTotal,
    grandTotal: Number(body.grandTotal) || calculatedTotal,
    status: ['draft', 'submitted', 'sent', 'approved', 'rejected'].includes(body.status) ? body.status : 'draft'
  };
}

function normalizeCompanyName(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(private|pvt)\.?\b/g, ' private ')
    .replace(/\b(limited|ltd)\.?\b/g, ' limited ')
    .replace(/\bl\.?l\.?p\.?\b/g, ' llp ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ccpRequestHeaders() {
  const apiKey = cleanString(process.env.CCP_API_KEY || process.env.CCP_SHARED_API_KEY || process.env.CCP_SHARED_SECRET);
  return {
    accept: 'application/json',
    ...(apiKey ? { 'x-ccp-api-key': apiKey, 'x-ccp-secret': apiKey } : {})
  };
}

function ccpQuotationUrl() {
  const configured = cleanString(process.env.CCP_API_URL || process.env.CCP_API_BASE_URL);
  if (!configured) throw new Error('CCP_API_URL is not configured on the CRM backend');
  const base = configured.replace(/\/$/, '');
  if (/\/api\/ccp$/i.test(base)) return `${base}/quotations`;
  if (/\/api$/i.test(base)) return `${base}/ccp/quotations`;
  return `${base}/api/ccp/quotations`;
}

async function fetchCcpQuotations() {
  const url = ccpQuotationUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  console.info('[CCP quotation sync] request', { url });
  try {
    const response = await fetch(url, { headers: ccpRequestHeaders(), signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    const quotations = Array.isArray(payload.quotations) ? payload.quotations : null;
    console.info('[CCP quotation sync] response', { url, httpStatus: response.status, responseTotal: payload.total, received: quotations?.length ?? 0 });
    if (!response.ok) {
      if (response.status === 503 && /credential is not configured/i.test(String(payload.error || payload.message || ''))) {
        console.warn('[CCP quotation sync] API credential unavailable; using server-side CCP Mongo fallback', { url });
        return fetchCcpQuotationsFromMongo();
      }
      const error = new Error(payload.error || payload.message || `CCP quotation API returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!quotations) {
      const error = new Error('CCP quotation API response does not contain a quotations array');
      error.status = 502;
      throw error;
    }
    return { quotations, total: Number(payload.total) || quotations.length, url, status: response.status };
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutError = new Error('CCP quotation request timed out');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCcpQuotationsFromMongo() {
  const dbName = cleanString(process.env.CCP_DB_NAME) || 'ccp';
  const db = require('mongoose').connection.useDb(dbName, { useCache: true });
  const quotations = await db.collection('quotations').find({}).sort({ updatedAt: -1, createdAt: -1 }).toArray();
  const leadIds = [...new Set(quotations.map((row) => {
    const value = row?.selectedLead && typeof row.selectedLead === 'object' ? row.selectedLead._id : row?.selectedLead;
    return cleanString(value);
  }).filter(Boolean))];
  const objectIds = leadIds.filter((id) => require('mongoose').Types.ObjectId.isValid(id)).map((id) => new (require('mongoose').Types.ObjectId)(id));
  const leads = objectIds.length
    ? await db.collection('leads').find({ _id: { $in: objectIds } }).project({ leadCode: 1, company: 1, contactPerson: 1, designation: 1, mobileNo1: 1, mobileNo2: 1, emails: 1 }).toArray()
    : [];
  const leadsById = new Map(leads.map((lead) => [String(lead._id), lead]));
  const populated = quotations.map((row) => {
    const storedLead = row?.selectedLead && typeof row.selectedLead === 'object' ? row.selectedLead : null;
    const leadId = cleanString(storedLead?._id || row.selectedLead);
    const lead = leadsById.get(leadId);
    return { ...row, selectedLead: lead ? { ...lead, _id: String(lead._id) } : (storedLead || row.selectedLead) };
  });
  console.info('[CCP quotation sync] Mongo fallback response', { sourceDb: dbName, received: populated.length });
  return { quotations: populated, total: populated.length, url: `mongodb:${dbName}.quotations`, status: 200 };
}

function quotationLeadSnapshot(row) {
  return row?.selectedLead && typeof row.selectedLead === 'object' ? row.selectedLead : {};
}

async function matchCrmLead(row) {
  const selectedLead = quotationLeadSnapshot(row);
  const ccpLeadId = cleanString(selectedLead._id || row.selectedLead || row.ccpLeadId);
  const leadCode = cleanString(selectedLead.leadCode || row.leadCode);

  const identifiers = [ccpLeadId].filter(Boolean);
  if (identifiers.length) {
    const bySourceId = await Lead.find({
      $or: [
        { sourceLeadId: { $in: identifiers } },
        { ccpLeadId: { $in: identifiers } },
        { externalLeadId: { $in: identifiers } }
      ]
    }).limit(2).lean();
    if (bySourceId.length === 1) return { lead: bySourceId[0], matchedBy: 'ccpLeadId' };
    if (bySourceId.length > 1) return { reason: 'Multiple CRM leads share the CCP/source lead ID' };
  }

  if (leadCode) {
    const byCode = await Lead.find({ leadCode }).limit(2).lean();
    if (byCode.length === 1) return { lead: byCode[0], matchedBy: 'leadCode' };
    if (byCode.length > 1) return { reason: 'Multiple CRM leads share the lead code' };
  }

  const companyName = cleanString(row.companyName || selectedLead.company);
  const normalizedCompany = normalizeCompanyName(companyName);
  if (!normalizedCompany) return { reason: 'CCP quotation has no usable lead identifier or company name' };
  const candidates = await Lead.find({ company: { $exists: true, $ne: '' } }).select('leadCode sourceLeadId company contactPerson').lean();
  const companyMatches = candidates.filter((lead) => normalizeCompanyName(lead.company) === normalizedCompany);
  if (companyMatches.length === 1) return { lead: companyMatches[0], matchedBy: 'company' };
  if (companyMatches.length > 1) return { reason: 'Company-name match is ambiguous' };
  return { reason: 'No matching CRM lead found' };
}

function mapCcpQuotation(row, lead) {
  const selectedLead = quotationLeadSnapshot(row);
  const items = cleanItems(row.items);
  const calculatedTotal = items.reduce((sum, item) => sum + ((Number(item.unit) || 0) * (Number(item.basicAmount) || 0)), 0);
  return {
    ccpQuotationId: cleanString(row._id || row.id),
    leadId: lead?._id ? String(lead._id) : undefined,
    ccpLeadId: cleanString(selectedLead._id || row.selectedLead || row.ccpLeadId),
    leadCode: cleanString(lead?.leadCode || selectedLead.leadCode || row.leadCode),
    companyName: cleanString(row.companyName || selectedLead.company || lead?.company),
    quotationNumber: cleanString(row.quotationNumber),
    quotationDate: row.quotationDate || row.createdAt || undefined,
    validUntil: cleanString(row.validUntil),
    leadDetails: cleanLeadDetails({
      companyName: row.companyName || selectedLead.company || lead?.company,
      contactPerson: selectedLead.contactPerson || lead?.contactPerson,
      designation: selectedLead.designation || lead?.designation,
      mobileNo1: selectedLead.mobileNo1 || lead?.mobileNo1,
      mobileNo2: selectedLead.mobileNo2 || lead?.mobileNo2,
      gstNumber: selectedLead.gstNumber || selectedLead.gstin || selectedLead.gst
    }),
    items,
    terms: cleanTerms(row.terms),
    subtotal: Number(row.subtotal) || calculatedTotal,
    grandTotal: Number(row.grandTotal) || Number(row.subtotal) || calculatedTotal,
    status: ['draft', 'submitted'].includes(row.status) ? row.status : 'draft',
    source: 'CCP',
    ccpSource: ['manual', 'bulk'].includes(cleanString(row.source).toLowerCase()) ? cleanString(row.source).toLowerCase() : cleanString(row.source),
    ccpCreatedAt: row.createdAt || undefined,
    ccpUpdatedAt: row.updatedAt || row.createdAt || undefined,
    lastSyncedAt: new Date(),
    syncMatchStatus: lead?._id ? 'matched' : 'unmatched',
    unmatchedReason: ''
  };
}

function comparableCcpFields(record) {
  return JSON.stringify({
    leadId: record.leadId || '', ccpLeadId: record.ccpLeadId, leadCode: record.leadCode,
    companyName: record.companyName, quotationNumber: record.quotationNumber,
    quotationDate: record.quotationDate ? new Date(record.quotationDate).toISOString() : '',
    validUntil: record.validUntil, items: record.items, terms: record.terms,
    subtotal: record.subtotal, grandTotal: record.grandTotal, status: record.status,
    source: record.source, ccpSource: record.ccpSource,
    ccpUpdatedAt: record.ccpUpdatedAt ? new Date(record.ccpUpdatedAt).toISOString() : '',
    syncMatchStatus: record.syncMatchStatus, unmatchedReason: record.unmatchedReason || ''
  });
}

function approvalDateParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { date: '-', time: '-' };
  }

  return {
    date: date.toLocaleDateString('en-GB'),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
}

function readCreatedBy(quotation) {
  return quotation.createdBy?.name || quotation.createdBy?.email || 'CRM User';
}

function mapQuotationPendingApprovalRow(quotation, approvalType = 'CREATE') {
  const parts = approvalDateParts(quotation.createdAt || new Date());
  const details = quotation.leadDetails || {};
  const firstItem = Array.isArray(quotation.items) ? quotation.items[0] || {} : {};
  const totalBasicAmount = (quotation.items || []).reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0);

  return {
    id: quotation._id,
    quotationId: quotation._id,
    quotationNumber: quotation.quotationNumber || '',
    leadId: quotation.leadId || '',
    leadCode: quotation.leadCode || '',
    leadDetails: details,
    validUntil: quotation.validUntil || '',
    items: Array.isArray(quotation.items) ? quotation.items : [],
    terms: Array.isArray(quotation.terms) ? quotation.terms : [],
    status: quotation.status || 'draft',
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
    source: 'crm',
    uniqueId: quotation.quotationNumber || quotation.leadCode || '',
    userName: readCreatedBy(quotation),
    leadGeneratedBy: readCreatedBy(quotation),
    companyName: details.companyName || 'Untitled quotation',
    contactPerson: details.contactPerson || '-',
    mobileNo1: details.mobileNo1 || '-',
    quotationDate: parts.date,
    service: firstItem.serviceCategory || '-',
    category: firstItem.eprCategory || '-',
    piboCategory: firstItem.piboCategory || '-',
    basicAmount: totalBasicAmount || firstItem.basicAmount || '-',
    approvalStatus: quotation.status === 'approved' ? 'APPROVED' : quotation.status === 'rejected' ? 'REJECTED' : 'PENDING',
    approvalType,
    createdBy: readCreatedBy(quotation),
    requestDate: parts.date,
    requestTime: parts.time
  };
}

async function upsertQuotationPendingApproval(quotation, approvalType = 'CREATE') {
  const row = mapQuotationPendingApprovalRow(quotation, approvalType);
  const status = normalizeApprovalStatus(row.approvalStatus) || 'PENDING';
  const isFreshPendingRequest = status === 'PENDING';
  const record = await PendingApproval.findOneAndUpdate(
    { type: 'quotation', source: 'crm', sourceClientId: String(quotation._id) },
    {
      $setOnInsert: {
        type: 'quotation',
        source: 'crm',
        sourceClientId: String(quotation._id),
        uniqueId: row.uniqueId
      },
      $set: {
        clientName: row.companyName,
        approvalStatus: status,
        piboCategory: row.piboCategory,
        eprCategory: row.category,
        createdByName: row.createdBy,
        requestDate: row.requestDate,
        requestTime: row.requestTime,
        payload: row,
        nextReminderAt: isFreshPendingRequest ? new Date() : null,
        ...(isFreshPendingRequest ? { reminderCount: 0, lastReminderAt: null, reminderError: '' } : {})
      },
      ...(isFreshPendingRequest ? { $unset: { actionBy: 1, actionAt: 1, remarks: 1, notifiedAdminEmails: 1 } } : {})
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return record;
}

async function nextQuotationNumber() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const financialYear = `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
  const prefix = `AT/${financialYear}/`;
  const latest = await Quotation.findOne({ quotationNumber: { $regex: `^AT/${financialYear}/\\d+$`, $options: 'i' } })
    .sort({ quotationNumber: -1, createdAt: -1 })
    .select('quotationNumber')
    .lean();
  const next = (Number.parseInt(String(latest?.quotationNumber || '').split('/').at(-1), 10) || 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

exports.listQuotations = async (req, res) => {
  const filter = {};
  const search = cleanString(req.query.search);
  const status = cleanString(req.query.status);
  const source = cleanString(req.query.source);
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { quotationNumber: regex }, { companyName: regex }, { leadCode: regex },
      { 'leadDetails.companyName': regex }, { 'leadDetails.contactPerson': regex }
    ];
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit) || 20)) : 0;
  const query = Quotation.find(filter)
    .populate('createdBy', 'name email')
    .sort({ quotationDate: -1, createdAt: -1 });
  if (limit) query.skip((page - 1) * limit).limit(limit);
  const [quotations, total] = await Promise.all([query.lean(), Quotation.countDocuments(filter)]);
  res.json({ ok: true, quotations, pagination: { page, limit: limit || total, total, pages: limit ? Math.ceil(total / limit) : 1 } });
};

exports.getQuotation = async (req, res) => {
  const quotation = await Quotation.findById(req.params.id).populate('createdBy', 'name email').lean();
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
  return res.json({ ok: true, quotation });
};

exports.listLeadQuotations = async (req, res) => {
  const leadId = cleanString(req.params.leadId);
  const quotations = await Quotation.find({ leadId }).populate('createdBy', 'name email').sort({ quotationDate: -1, createdAt: -1 }).lean();
  return res.json({ ok: true, quotations });
};

exports.syncCcpQuotations = async (req, res) => {
  const summary = { fetched: 0, created: 0, updated: 0, unchanged: 0, unmatched: 0, failed: 0 };
  const unmatched = [];
  const failures = [];
  let rows;
  try {
    const fetched = await fetchCcpQuotations();
    rows = fetched.quotations;
    summary.fetched = rows.length;
  } catch (err) {
    const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 502;
    return res.status(status).json({ ok: false, error: err.message || 'Unable to fetch quotations from CCP', summary });
  }

  for (const row of rows) {
    const ccpQuotationId = cleanString(row?._id || row?.id);
    const selectedLead = quotationLeadSnapshot(row);
    const issueIdentity = ccpQuotationId || `${cleanString(selectedLead._id || row?.selectedLead)}:${cleanString(row?.quotationNumber)}`;
    try {
      if (!ccpQuotationId || !cleanString(row.quotationNumber)) {
        throw new Error('CCP quotation ID and quotation number are required');
      }
      const match = await matchCrmLead(row);
      if (!match.lead) {
        const issue = {
          ccpQuotationId: issueIdentity,
          ccpLeadId: cleanString(selectedLead._id || row.selectedLead),
          leadCode: cleanString(selectedLead.leadCode || row.leadCode),
          quotationNumber: cleanString(row.quotationNumber),
          companyName: cleanString(row.companyName || selectedLead.company),
          reason: match.reason || 'No matching CRM lead found',
          status: 'unmatched', lastSeenAt: new Date(), resolvedAt: null
        };
        await QuotationSyncIssue.findOneAndUpdate({ ccpQuotationId: issueIdentity }, { $set: issue }, { upsert: true, new: true });
        const unmatchedQuotation = {
          ...mapCcpQuotation(row, null),
          syncMatchStatus: 'unmatched',
          unmatchedReason: issue.reason
        };
        const existingUnmatched = await Quotation.findOne({ ccpQuotationId }).lean();
        if (!existingUnmatched) {
          await Quotation.create(unmatchedQuotation);
          summary.created += 1;
        } else {
          const changed = comparableCcpFields(existingUnmatched) !== comparableCcpFields(unmatchedQuotation);
          await Quotation.updateOne(
            { _id: existingUnmatched._id },
            { $set: changed ? unmatchedQuotation : { lastSyncedAt: unmatchedQuotation.lastSyncedAt, unmatchedReason: issue.reason, syncMatchStatus: 'unmatched' } }
          );
          summary[changed ? 'updated' : 'unchanged'] += 1;
        }
        unmatched.push(issue);
        summary.unmatched += 1;
        console.warn('[CCP quotation sync] unmatched', { ccpQuotationId, quotationNumber: issue.quotationNumber, ccpLeadId: issue.ccpLeadId, reason: issue.reason });
        continue;
      }

      const mapped = mapCcpQuotation(row, match.lead);
      const existing = await Quotation.findOne({
        $or: [
          { ccpQuotationId },
          { leadId: mapped.leadId, quotationNumber: mapped.quotationNumber }
        ]
      }).lean();

      if (!existing) {
        await Quotation.create(mapped);
        summary.created += 1;
      } else {
        const changed = comparableCcpFields(existing) !== comparableCcpFields(mapped);
        await Quotation.updateOne({ _id: existing._id }, { $set: changed ? mapped : { lastSyncedAt: mapped.lastSyncedAt, ccpQuotationId } });
        summary[changed ? 'updated' : 'unchanged'] += 1;
      }
      await QuotationSyncIssue.findOneAndUpdate(
        { ccpQuotationId: issueIdentity },
        { $set: { status: 'resolved', resolvedAt: new Date(), lastSeenAt: new Date() } }
      );
    } catch (err) {
      summary.failed += 1;
      const failure = {
        ccpQuotationId: issueIdentity,
        ccpLeadId: cleanString(selectedLead._id || row?.selectedLead),
        leadCode: cleanString(selectedLead.leadCode || row?.leadCode),
        quotationNumber: cleanString(row?.quotationNumber),
        companyName: cleanString(row?.companyName || selectedLead.company),
        reason: err.message || 'Quotation sync failed', status: 'failed', lastSeenAt: new Date()
      };
      failures.push(failure);
      await QuotationSyncIssue.findOneAndUpdate({ ccpQuotationId: issueIdentity }, { $set: failure }, { upsert: true, new: true }).catch(() => {});
      console.error('[CCP quotation sync] failed', { ccpQuotationId: issueIdentity, quotationNumber: failure.quotationNumber, reason: failure.reason });
    }
  }

  console.info('[CCP quotation sync] complete', summary);
  return res.json({ ok: summary.failed === 0, ...summary, summary, unmatched, failures });
};

exports.createQuotation = async (req, res) => {
  const gstError = validateGstNumber(req.body.leadDetails?.gstNumber);
  if (gstError) return res.status(400).json({ error: gstError });
  const data = cleanBody(req.body);
  const quotation = await Quotation.create({
    ...data,
    status: 'draft',
    quotationNumber: await nextQuotationNumber(),
    createdBy: req.user?._id
  });
  await quotation.populate('createdBy', 'name email');
  await upsertQuotationPendingApproval(quotation, 'CREATE');
  res.status(201).json({ ok: true, quotation });
};

exports.updateQuotation = async (req, res) => {
  const gstError = validateGstNumber(req.body.leadDetails?.gstNumber);
  if (gstError) return res.status(400).json({ error: gstError });
  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

  // Every revision, including a one-field edit, starts a completely new approval cycle.
  // Client-supplied status is deliberately ignored.
  Object.assign(quotation, cleanBody(req.body));
  quotation.status = 'draft';
  await quotation.save();
  await quotation.populate('createdBy', 'name email');
  await upsertQuotationPendingApproval(quotation, 'UPDATE');
  res.json({ ok: true, quotation });
};

exports.updateQuotationApproval = async (req, res) => {
  const status = normalizeApprovalStatus(req.body.status || req.body.approvalStatus);
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Approval status must be APPROVED or REJECTED' });
  }

  const approvalRecordId = String(req.body.approvalRecordId || '').trim();
  const update = {
    approvalStatus: status,
    nextReminderAt: null,
    actionBy: req.user?._id,
    actionAt: new Date(),
    remarks: String(req.body.remarks || '').trim()
  };
  const quotation = await Quotation.findById(req.params.id).populate('createdBy', 'name email');

  if (!quotation) {
    if (!approvalRecordId) return res.status(404).json({ error: 'Quotation not found' });
    await PendingApproval.findByIdAndUpdate(approvalRecordId, update);
    return res.json({ ok: true });
  }

  quotation.status = status === 'APPROVED' ? 'approved' : 'rejected';
  await quotation.save();

  if (approvalRecordId) {
    await PendingApproval.findByIdAndUpdate(approvalRecordId, update);
  } else {
    await PendingApproval.findOneAndUpdate(
      { type: 'quotation', source: 'crm', sourceClientId: String(quotation._id) },
      update
    );
  }

  res.json({ ok: true, quotation });
};

exports.approveAllPendingQuotations = async (req, res) => {
  const remarks = String(req.body.remarks || 'Bulk approved').trim();
  const records = await PendingApproval.find({ type: 'quotation', approvalStatus: 'PENDING' });
  let approved = 0;
  const failures = [];

  for (const record of records) {
    try {
      const quotation = await Quotation.findById(record.sourceClientId);
      if (quotation) {
        quotation.status = 'approved';
        await quotation.save();
      }
      record.approvalStatus = 'APPROVED';
      record.nextReminderAt = null;
      record.actionBy = req.user?._id;
      record.actionAt = new Date();
      record.remarks = remarks;
      await record.save();
      approved += 1;
    } catch (err) {
      failures.push({
        id: record._id,
        quotation: record.uniqueId || record.clientName,
        error: err.message || 'Unable to approve quotation'
      });
    }
  }

  res.json({
    ok: failures.length === 0,
    approved,
    failed: failures.length,
    failures
  });
};

exports.mapQuotationPendingApprovalRow = mapQuotationPendingApprovalRow;
exports.upsertQuotationPendingApproval = upsertQuotationPendingApproval;

exports.listServiceCategories = async (req, res) => {
  const categories = await QuotationServiceCategory.find().sort({ name: 1 }).lean();
  res.json({ categories: categories.map((category) => category.name) });
};

exports.createServiceCategory = async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  if (name.length > 100) return res.status(400).json({ error: 'Category name must be under 100 characters' });

  try {
    const category = await QuotationServiceCategory.create({ name, createdBy: req.user?._id });
    return res.status(201).json({ category: category.name });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'This category already exists' });
    throw err;
  }
};

exports.listPiboCategories = async (req, res) => {
  const categories = await QuotationPiboCategory.find().sort({ name: 1 }).lean();
  return res.json({ categories: categories.map((category) => category.name) });
};

exports.createPiboCategory = async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!name) return res.status(400).json({ error: 'PIBO Category name is required' });
  if (name.length > 100) return res.status(400).json({ error: 'PIBO Category must be under 100 characters' });
  if (!/^[A-Z0-9][A-Z0-9 &()\/.,+_-]*$/.test(name)) return res.status(400).json({ error: 'PIBO Category contains unsupported characters' });

  try {
    const category = await QuotationPiboCategory.create({ name, createdBy: req.user?._id });
    return res.status(201).json({ category: category.name });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'This PIBO Category already exists' });
    throw err;
  }
};

exports._test = {
  normalizeCompanyName,
  ccpRequestHeaders,
  ccpQuotationUrl,
  mapCcpQuotation,
  comparableCcpFields
};
