const Quotation = require('../models/Quotation');
const PendingApproval = require('../models/PendingApproval');
const QuotationServiceCategory = require('../models/QuotationServiceCategory');
const QuotationPiboCategory = require('../models/QuotationPiboCategory');
const QuotationSyncIssue = require('../models/QuotationSyncIssue');
const Lead = require('../models/Lead');
const {
  PIBO_PARENTS,
  BUILT_IN_PIBO_CATEGORIES,
  cleanCategoryName,
  normalizeParent,
  normalizedCategoryName,
  inferPiboParent,
  validatePiboSelection
} = require('../utils/piboCategories');

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

function roundMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: cleanString(item.id),
      serviceCategory: cleanString(item.serviceCategory),
      servicesForYear: cleanString(item.servicesForYear),
      eprCategory: cleanString(item.eprCategory),
      piboParent: normalizeParent(item.piboParent || item.piboCategoryParent) || inferPiboParent(item.piboCategory) || undefined,
      piboCategory: cleanString(item.piboCategory),
      unit: cleanString(item.unit),
      unitLabel: cleanString(item.unitLabel),
      basicAmount: roundMoney(item.basicAmount)
    }))
    .filter((item) => Object.values(item).some((value) => String(value || '').trim() !== '' && value !== 0));
}

function cleanTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms.map(cleanString).filter(Boolean);
}

async function validateQuotationPiboItems(items = []) {
  for (let index = 0; index < items.length; index += 1) {
    try {
      const selection = await validatePiboSelection({
        parent: items[index].piboParent || items[index].piboCategoryParent,
        child: items[index].piboCategory,
        required: true
      });
      items[index].piboParent = selection.piboParent;
      items[index].piboCategory = selection.piboCategory;
      delete items[index].piboCategoryParent;
    } catch (error) {
      error.message = `Quotation item ${index + 1}: ${error.message}`;
      throw error;
    }
  }
}

function cleanBody(body) {
  const items = cleanItems(body.items);
  const calculatedTotal = roundMoney(items.reduce((sum, item) => sum + ((Number(item.unit) || 0) * (Number(item.basicAmount) || 0)), 0));
  return {
    leadId: cleanString(body.leadId),
    leadCode: cleanString(body.leadCode),
    leadDetails: cleanLeadDetails(body.leadDetails),
    validUntil: cleanString(body.validUntil),
    companyName: cleanString(body.companyName || body.leadDetails?.companyName),
    quotationDate: body.quotationDate || undefined,
    items,
    terms: cleanTerms(body.terms),
    subtotal: roundMoney(body.subtotal || calculatedTotal),
    grandTotal: roundMoney(body.grandTotal || calculatedTotal),
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
    const hasUnresolvedCreator = quotations.some((row) =>
      (row?.createdBy && typeof row.createdBy !== 'object') ||
      (row?.selectedLead && typeof row.selectedLead !== 'object')
    );
    if (hasUnresolvedCreator) {
      try {
        console.info('[CCP quotation sync] creator identity is not populated; enriching from CCP Mongo');
        return await fetchCcpQuotationsFromMongo();
      } catch (mongoError) {
        console.warn('[CCP quotation sync] creator enrichment unavailable; continuing with API response', { error: mongoError.message });
      }
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
    ? await db.collection('leads').find({ _id: { $in: objectIds } }).project({ leadCode: 1, sourceLeadId: 1, company: 1, contactPerson: 1, designation: 1, mobileNo1: 1, mobileNo2: 1, emails: 1, importedCreatedBy: 1, createdByEmail: 1, createdBy: 1, assignedToText: 1 }).toArray()
    : [];
  const creatorIds = [...new Set([
    ...quotations.map((row) => cleanString(row.createdBy)),
    ...leads.map((lead) => cleanString(lead.createdBy))
  ].filter((id) => require('mongoose').Types.ObjectId.isValid(id)))]
    .map((id) => new (require('mongoose').Types.ObjectId)(id));
  const users = creatorIds.length
    ? await db.collection('users').find({ _id: { $in: creatorIds } }).project({ name: 1, email: 1 }).toArray()
    : [];
  const usersById = new Map(users.map((user) => [String(user._id), { _id: String(user._id), name: user.name || '', email: user.email || '' }]));
  const leadsById = new Map(leads.map((lead) => [String(lead._id), lead]));
  const populated = quotations.map((row) => {
    const storedLead = row?.selectedLead && typeof row.selectedLead === 'object' ? row.selectedLead : null;
    const leadId = cleanString(storedLead?._id || row.selectedLead);
    const lead = leadsById.get(leadId);
    const populatedLead = lead ? {
      ...lead,
      _id: String(lead._id),
      createdBy: usersById.get(cleanString(lead.createdBy)) || lead.createdBy
    } : (storedLead || row.selectedLead);
    return {
      ...row,
      createdBy: usersById.get(cleanString(row.createdBy)) || row.createdBy,
      selectedLead: populatedLead
    };
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
  const quotationCreator = cleanString(row.createdBy?.name || row.createdByName || row.createdBy?.email || row.createdByEmail);
  const leadCreator = cleanString(
    selectedLead.importedCreatedBy || selectedLead.createdBy?.name || selectedLead.createdBy?.email ||
    selectedLead.createdByEmail || lead?.importedCreatedBy || lead?.createdBy?.name || lead?.createdBy?.email ||
    lead?.createdByEmail || selectedLead.assignedToText || lead?.assignedToText
  );
  const assignedUserName = cleanString(selectedLead.assignedTo?.name || selectedLead.assignedToText || selectedLead.assignedToEmail || lead?.assignedTo?.name || lead?.assignedToText || lead?.assignedToEmail);
  const items = cleanItems(row.items);
  const calculatedTotal = roundMoney(items.reduce((sum, item) => sum + ((Number(item.unit) || 0) * (Number(item.basicAmount) || 0)), 0));
  return {
    ccpQuotationId: cleanString(row._id || row.id),
    leadId: lead?._id ? String(lead._id) : undefined,
    ccpLeadId: cleanString(selectedLead._id || row.selectedLead || row.ccpLeadId),
    leadCode: cleanString(lead?.leadCode || selectedLead.leadCode || row.leadCode),
    businessLeadCode: cleanString(selectedLead.sourceLeadId || lead?.sourceLeadId || row.businessLeadCode || row.sourceLeadId),
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
    subtotal: roundMoney(row.subtotal || calculatedTotal),
    grandTotal: roundMoney(row.grandTotal || row.subtotal || calculatedTotal),
    status: ['draft', 'submitted'].includes(row.status) ? row.status : 'draft',
    source: 'CCP',
    createdByName: quotationCreator || leadCreator,
    leadGeneratedBy: leadCreator || quotationCreator,
    assignedUserName,
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
    leadId: record.leadId || '', ccpLeadId: record.ccpLeadId, leadCode: record.leadCode, businessLeadCode: record.businessLeadCode || '',
    companyName: record.companyName, quotationNumber: record.quotationNumber,
    quotationDate: record.quotationDate ? new Date(record.quotationDate).toISOString() : '',
    validUntil: record.validUntil, items: record.items, terms: record.terms,
    subtotal: record.subtotal, grandTotal: record.grandTotal, status: record.status,
    source: record.source, ccpSource: record.ccpSource,
    createdByName: record.createdByName || '', leadGeneratedBy: record.leadGeneratedBy || '', assignedUserName: record.assignedUserName || '',
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
  return quotation.createdBy?.name || quotation.createdByName || quotation.createdBy?.email || (String(quotation.source || '').toLowerCase() === 'ccp' ? 'CCP User' : 'CRM User');
}

function quotationApprovalSource(quotation) {
  return String(quotation.source || '').trim().toLowerCase() === 'ccp' || quotation.ccpQuotationId ? 'ccp' : 'crm';
}

function mapQuotationPendingApprovalRow(quotation, approvalType = 'CREATE') {
  const parts = approvalDateParts(quotation.createdAt || new Date());
  const details = quotation.leadDetails || {};
  const firstItem = Array.isArray(quotation.items) ? quotation.items[0] || {} : {};
  const totalBasicAmount = roundMoney((quotation.items || []).reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0));
  const isBulkCcp = quotationApprovalSource(quotation) === 'ccp' && String(quotation.ccpSource || '').toLowerCase() === 'bulk';
  const leadCreator = quotation.leadGeneratedBy || readCreatedBy(quotation);
  const displayUser = isBulkCcp ? (quotation.assignedUserName || leadCreator) : readCreatedBy(quotation);
  const displayCreator = isBulkCcp ? leadCreator : readCreatedBy(quotation);

  return {
    id: quotation._id,
    quotationId: quotation._id,
    quotationNumber: quotation.quotationNumber || '',
    leadId: quotation.leadId || '',
    ccpLeadId: quotation.ccpLeadId || '',
    leadCode: quotation.leadCode || '',
    businessLeadCode: quotation.businessLeadCode || '',
    ccpSource: quotation.ccpSource || '',
    leadDetails: details,
    validUntil: quotation.validUntil || '',
    items: Array.isArray(quotation.items) ? quotation.items : [],
    terms: Array.isArray(quotation.terms) ? quotation.terms : [],
    status: quotation.status || 'draft',
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
    source: quotationApprovalSource(quotation),
    uniqueId: quotation.quotationNumber || quotation.leadCode || '',
    userName: displayUser,
    leadGeneratedBy: leadCreator,
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
    createdBy: displayCreator,
    requestDate: parts.date,
    requestTime: parts.time
  };
}

async function upsertQuotationPendingApproval(quotation, approvalType = 'CREATE') {
  const row = mapQuotationPendingApprovalRow(quotation, approvalType);
  const source = row.source || 'crm';
  const status = normalizeApprovalStatus(row.approvalStatus) || 'PENDING';
  const isFreshPendingRequest = status === 'PENDING';
  const record = await PendingApproval.findOneAndUpdate(
    { type: 'quotation', source, sourceClientId: String(quotation._id) },
    {
      $setOnInsert: {
        type: 'quotation',
        source,
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

async function hydrateCcpQuotationCreators(quotations = []) {
  const unresolved = quotations.filter((quotation) =>
    quotationApprovalSource(quotation) === 'ccp' &&
    (!cleanString(quotation.createdByName) || !cleanString(quotation.leadGeneratedBy)) &&
    cleanString(quotation.ccpQuotationId)
  );
  if (!unresolved.length) return quotations;

  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.useDb(cleanString(process.env.CCP_DB_NAME) || 'ccp', { useCache: true });
    const ccpIds = unresolved
      .map((quotation) => cleanString(quotation.ccpQuotationId))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const ccpRows = await db.collection('quotations').find({ _id: { $in: ccpIds } }).toArray();
    const leadIds = ccpRows.map((row) => row.selectedLead).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    const leads = leadIds.length ? await db.collection('leads').find({ _id: { $in: leadIds } }).toArray() : [];
    const leadsById = new Map(leads.map((lead) => [String(lead._id), lead]));
    const userIds = [...new Set([
      ...ccpRows.map((row) => cleanString(row.createdBy)),
      ...leads.map((lead) => cleanString(lead.createdBy))
    ].filter((id) => mongoose.Types.ObjectId.isValid(id)))]
      .map((id) => new mongoose.Types.ObjectId(id));
    const users = userIds.length ? await db.collection('users').find({ _id: { $in: userIds } }).project({ name: 1, email: 1 }).toArray() : [];
    const usersById = new Map(users.map((user) => [String(user._id), cleanString(user.name || user.email)]));
    const ccpById = new Map(ccpRows.map((row) => [String(row._id), row]));

    for (const quotation of unresolved) {
      const ccpRow = ccpById.get(cleanString(quotation.ccpQuotationId));
      if (!ccpRow) continue;
      const lead = leadsById.get(String(ccpRow.selectedLead)) || {};
      const quotationCreator = usersById.get(cleanString(ccpRow.createdBy)) || cleanString(ccpRow.createdByName || ccpRow.createdByEmail);
      const leadCreator = cleanString(lead.importedCreatedBy) || usersById.get(cleanString(lead.createdBy)) || cleanString(lead.createdByEmail) || quotationCreator;
      const createdByName = cleanString(quotation.createdByName) || quotationCreator || leadCreator;
      const leadGeneratedBy = cleanString(quotation.leadGeneratedBy) || leadCreator || quotationCreator;
      if (!createdByName && !leadGeneratedBy) continue;
      quotation.createdByName = createdByName;
      quotation.leadGeneratedBy = leadGeneratedBy;
      await Quotation.updateOne({ _id: quotation._id }, { $set: { createdByName, leadGeneratedBy } });
    }
  } catch (error) {
    console.warn('[CCP quotation creator hydration] skipped', { error: error.message });
  }

  return quotations;
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
      { quotationNumber: regex }, { companyName: regex }, { leadCode: regex }, { businessLeadCode: regex },
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
  const summary = { fetched: 0, created: 0, updated: 0, unchanged: 0, pendingSynced: 0, unmatched: 0, failed: 0 };
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
        let savedQuotation;
        let changed = false;
        if (!existingUnmatched) {
          savedQuotation = await Quotation.create(unmatchedQuotation);
          summary.created += 1;
        } else {
          changed = comparableCcpFields(existingUnmatched) !== comparableCcpFields(unmatchedQuotation);
          savedQuotation = await Quotation.findOneAndUpdate(
            { _id: existingUnmatched._id },
            { $set: changed ? unmatchedQuotation : { lastSyncedAt: unmatchedQuotation.lastSyncedAt, unmatchedReason: issue.reason, syncMatchStatus: 'unmatched' } },
            { new: true }
          );
          summary[changed ? 'updated' : 'unchanged'] += 1;
        }
        const hasPendingRecord = await PendingApproval.exists({ type: 'quotation', source: 'ccp', sourceClientId: String(savedQuotation._id) });
        if (!existingUnmatched || changed || !hasPendingRecord) {
          await upsertQuotationPendingApproval(savedQuotation, existingUnmatched ? 'UPDATE' : 'CREATE');
          summary.pendingSynced += 1;
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

      let savedQuotation;
      let changed = false;
      if (!existing) {
        savedQuotation = await Quotation.create(mapped);
        summary.created += 1;
      } else {
        changed = comparableCcpFields(existing) !== comparableCcpFields(mapped);
        savedQuotation = await Quotation.findOneAndUpdate(
          { _id: existing._id },
          { $set: changed ? mapped : { lastSyncedAt: mapped.lastSyncedAt, ccpQuotationId } },
          { new: true }
        );
        summary[changed ? 'updated' : 'unchanged'] += 1;
      }
      const hasPendingRecord = await PendingApproval.exists({ type: 'quotation', source: 'ccp', sourceClientId: String(savedQuotation._id) });
      if (!existing || changed || !hasPendingRecord) {
        await upsertQuotationPendingApproval(savedQuotation, existing ? 'UPDATE' : 'CREATE');
        summary.pendingSynced += 1;
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
  try {
    await validateQuotationPiboItems(data.items);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
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
  const data = cleanBody(req.body);
  try {
    await validateQuotationPiboItems(data.items);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
  const previous = quotation.toObject();
  const labels = {
    leadId: 'Lead', leadCode: 'Lead Code', companyName: 'Company', leadDetails: 'Lead Details',
    quotationDate: 'Quotation Date', validUntil: 'Valid Until', items: 'Quotation Items', terms: 'Terms',
    subtotal: 'Subtotal', grandTotal: 'Grand Total'
  };
  const changes = Object.keys(labels).filter((field) => JSON.stringify(previous[field] ?? null) !== JSON.stringify(data[field] ?? null)).map((field) => ({
    field,
    label: labels[field],
    before: previous[field] ?? null,
    after: data[field] ?? null
  }));
  Object.assign(quotation, data);
  quotation.status = 'draft';
  quotation.revisionHistory = [
    ...(Array.isArray(quotation.revisionHistory) ? quotation.revisionHistory : []),
    {
      at: new Date(),
      userId: String(req.user?._id || ''),
      userName: req.user?.name || req.user?.email || 'CRM User',
      userEmail: req.user?.email || '',
      changedFields: changes.map((change) => change.field),
      changes
    }
  ];
  quotation.markModified('revisionHistory');
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
exports.hydrateCcpQuotationCreators = hydrateCcpQuotationCreators;

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
  const custom = await QuotationPiboCategory.find({ parent: { $in: PIBO_PARENTS } }).sort({ parent: 1, name: 1 }).lean();
  const builtIn = Object.entries(BUILT_IN_PIBO_CATEGORIES)
    .flatMap(([parent, names]) => names.map((name) => ({ parent, name, custom: false })));
  return res.json({
    categories: [...builtIn, ...custom.map((category) => ({ parent: category.parent, name: category.name, custom: true }))]
  });
};

exports.createPiboCategory = async (req, res) => {
  const parent = normalizeParent(req.body.parent);
  const name = cleanCategoryName(req.body.name);
  if (!parent) return res.status(400).json({ error: 'Parent is required and must be PIBO, SIMP, or PWP.' });
  if (!name) return res.status(400).json({ error: `${parent} Category name is required.` });
  if (name.length > 60) return res.status(400).json({ error: 'Category name must be 60 characters or fewer.' });

  const normalizedName = normalizedCategoryName(parent, name);
  const builtInDuplicate = BUILT_IN_PIBO_CATEGORIES[parent].some((item) => item.toLowerCase() === name.toLowerCase());
  if (builtInDuplicate) return res.status(409).json({ error: `This category already exists under ${parent}.` });

  try {
    const category = await QuotationPiboCategory.create({ parent, name, normalizedName, createdBy: req.user?._id });
    return res.status(201).json({ category: { parent: category.parent, name: category.name } });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: `This category already exists under ${parent}.` });
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
