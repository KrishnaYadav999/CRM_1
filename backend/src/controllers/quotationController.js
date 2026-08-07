const Quotation = require('../models/Quotation');
const PendingApproval = require('../models/PendingApproval');
const QuotationServiceCategory = require('../models/QuotationServiceCategory');
const QuotationPiboCategory = require('../models/QuotationPiboCategory');
const QuotationDropdownOption = require('../models/QuotationDropdownOption');
const { resolveCrmRelationships } = require('../services/crmRelationships');
const Lead = require('../models/Lead');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendQuotationLifecycleEmail } = require('../services/quotationLifecycleEmails');
const {
  BUILT_IN_SERVICE_CATEGORIES,
  normalizeServiceCategoryName
} = require('../constants/quotationServiceCategories');
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

async function ensureBuiltInServiceCategories() {
  if (!BUILT_IN_SERVICE_CATEGORIES.length) return;
  await QuotationServiceCategory.bulkWrite(
    BUILT_IN_SERVICE_CATEGORIES.map((name) => ({
      updateOne: {
        filter: { name },
        update: { $setOnInsert: { name } },
        upsert: true
      }
    })),
    { ordered: false }
  );
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

function normalizeDateOnly(value) {
  const raw = cleanString(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function financialYearFromDate(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return '';
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function isMeaningfulItem(item = {}) {
  return [
    item.industryType,
    item.serviceCategory,
    item.serviceStartDate,
    item.serviceEndDate,
    item.servicesForYear,
    item.eprCategory,
    item.businessCategory,
    item.piboCategory
  ].some((value) => cleanString(value))
    || Number(item.basicAmount) > 0;
}

function cleanItems(items, user = null) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const serviceStartDate = normalizeDateOnly(item.serviceStartDate);
      const serviceEndDate = normalizeDateOnly(item.serviceEndDate);
      return {
        id: cleanString(item.id),
        sourceServiceIndex: Number.isInteger(Number(item.sourceServiceIndex)) && Number(item.sourceServiceIndex) >= 0
          ? Number(item.sourceServiceIndex)
          : undefined,
        serviceAddedBy: cleanString(item.serviceAddedBy),
        industryType: cleanString(item.industryType),
        financialYear: cleanString(item.financialYear),
        validityPeriod: Math.max(1, Math.min(50, Number(item.validityPeriod) || 1)),
        servicePeriod: Math.max(1, Math.min(50, Number(item.servicePeriod) || 1)),
        annualReturnYears: [...new Set((Array.isArray(item.annualReturnYears) ? item.annualReturnYears : []).map(cleanString).filter(Boolean))],
        servicesOffered: cleanString(item.servicesOffered),
        applicableService: cleanString(item.applicableService),
        serviceCategory: cleanString(item.serviceCategory),
        serviceStartDate,
        serviceEndDate,
        servicesForYear: financialYearFromDate(serviceStartDate || serviceEndDate) || cleanString(item.servicesForYear),
        eprCategory: cleanString(item.eprCategory),
        businessCategory: cleanString(item.businessCategory) || undefined,
        piboParent: normalizeParent(item.piboParent || item.piboCategoryParent) || inferPiboParent(item.piboCategory) || undefined,
        piboCategory: cleanString(item.piboCategory),
        unit: '1',
        unitLabel: cleanString(item.unitLabel),
        basicAmount: roundMoney(item.basicAmount)
      };
    })
    .filter((item) => isMeaningfulItem(item));
}

function cleanTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms.map(cleanString).filter(Boolean);
}

const PAYMENT_TERM_OPTIONS = [
  '100% after completion of work',
  '50% advance and 50% after completion of work',
  '100% advance payment'
];

function validatePaymentTerms(terms = []) {
  return terms.filter((term) => PAYMENT_TERM_OPTIONS.includes(term)).length === 1 ? '' : 'Select exactly one Terms & Conditions payment option.';
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

function validateQuotationItemDates(items = []) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    if (!item.serviceStartDate) throw new Error(`Quotation item ${index + 1}: Service Start Date is required.`);
    if (!item.serviceEndDate) throw new Error(`Quotation item ${index + 1}: Service End Date is required.`);
    if (item.serviceEndDate < item.serviceStartDate) {
      throw new Error(`Quotation item ${index + 1}: Service End Date must be on or after Service Start Date.`);
    }
  }
}

function cleanBody(body, user = null) {
  const items = cleanItems(body.items, user);
  const pricingMode = body.pricingMode === 'combined' ? 'combined' : 'individual';
  const individualTotal = roundMoney(items.reduce((sum, item) => sum + ((Number(item.unit) || 0) * (Number(item.basicAmount) || 0)), 0));
  const combinedBasicAmount = pricingMode === 'combined' ? roundMoney(body.combinedBasicAmount) : 0;
  const calculatedTotal = pricingMode === 'combined' ? combinedBasicAmount : individualTotal;
  return {
    leadId: cleanString(body.leadId),
    leadCode: cleanString(body.leadCode),
    leadDetails: cleanLeadDetails(body.leadDetails),
    validUntil: cleanString(body.validUntil),
    pricingMode,
    serviceState: body.serviceState === 'closed' ? 'closed' : 'open',
    combinedBasicAmount,
    companyName: cleanString(body.companyName || body.leadDetails?.companyName),
    quotationDate: body.quotationDate || undefined,
    items,
    terms: cleanTerms(body.terms),
    scopeOfWork: cleanTerms(body.scopeOfWork),
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

function preserveTerminalApprovalStatus(existing, incoming) {
  const currentStatus = cleanString(existing?.status).toLowerCase();
  const incomingStatus = cleanString(incoming?.status).toLowerCase();
  if (['approved', 'rejected'].includes(currentStatus) && ['draft', 'submitted', 'sent'].includes(incomingStatus)) {
    return { ...incoming, status: currentStatus };
  }
  return incoming;
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
  return quotation.createdBy?.name || quotation.createdByName || quotation.createdBy?.email || 'CRM User';
}

function quotationApprovalSource(quotation) {
  return 'crm';
}

function mapQuotationPendingApprovalRow(quotation, approvalType = 'CREATE') {
  const parts = approvalDateParts(quotation.createdAt || new Date());
  const details = quotation.leadDetails || {};
  const firstItem = Array.isArray(quotation.items) ? quotation.items[0] || {} : {};
  const itemBasicAmount = roundMoney((quotation.items || []).reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0));
  const totalBasicAmount = quotation.pricingMode === 'combined'
    ? roundMoney(quotation.combinedBasicAmount || quotation.grandTotal)
    : itemBasicAmount;
  const leadCreator = quotation.leadGeneratedBy || readCreatedBy(quotation);
  const displayUser = readCreatedBy(quotation);
  const displayCreator = readCreatedBy(quotation);

  return {
    id: quotation._id,
    quotationId: quotation._id,
    quotationNumber: quotation.quotationNumber || '',
    leadId: quotation.leadId || '',
    sourceLeadId: quotation.sourceLeadId || quotation.externalLeadId || quotation.leadId || '',
    leadCode: quotation.leadCode || '',
    businessLeadCode: quotation.businessLeadCode || '',
    leadDetails: details,
    validUntil: quotation.validUntil || '',
    pricingMode: quotation.pricingMode || 'individual',
    combinedBasicAmount: quotation.combinedBasicAmount || 0,
    items: Array.isArray(quotation.items) ? quotation.items : [],
    terms: Array.isArray(quotation.terms) ? quotation.terms : [],
    scopeOfWork: Array.isArray(quotation.scopeOfWork) ? quotation.scopeOfWork : [],
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

  if (approvalType === 'UPDATE') {
    const reviewers = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
    const notification = await Notification.create({
      title: 'Quotation updated — re-approval required',
      description: `${row.quotationNumber || 'Quotation'} for ${row.companyName || 'a client'} was updated and returned to Pending Approval.`,
      tag: 'Quotation Approval',
      kind: 'quotation_reapproval_required',
      audience: reviewers.map((user) => user._id),
      visibleToRoles: ['admin', 'superadmin'],
      createdBy: quotation.createdBy?._id || quotation.createdBy,
      createdByName: row.createdBy || 'CRM User',
      metadata: { quotationId: String(quotation._id), approvalRecordId: String(record._id), approvalType: 'UPDATE' }
    });
    notification.crmNotificationId = String(notification._id);
    await notification.save();
  }

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
  const MIN_START = 313;
  const latestNum = Number.parseInt(String(latest?.quotationNumber || '').split('/').at(-1), 10) || 0;
  const next = Math.max(latestNum, MIN_START - 1) + 1;
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

exports.createQuotation = async (req, res) => {
  const gstError = validateGstNumber(req.body.leadDetails?.gstNumber);
  if (gstError) return res.status(400).json({ error: gstError });
  const data = cleanBody(req.body, req.user);
  const termsError = validatePaymentTerms(data.terms);
  if (termsError) return res.status(400).json({ error: termsError });
  try {
    validateQuotationItemDates(data.items);
    await validateQuotationPiboItems(data.items);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
  const quotation = await Quotation.create({
    ...data,
    ...await resolveCrmRelationships(data),
    status: 'draft',
    quotationNumber: await nextQuotationNumber(),
    createdBy: req.user?._id
  });
  await quotation.populate('createdBy', 'name email');
  await upsertQuotationPendingApproval(quotation, 'CREATE');
  await sendQuotationLifecycleEmail({ quotation, event: 'created', actor: req.user })
    .catch((error) => console.error('[Quotation lifecycle email] create failed', error));
  res.status(201).json({ ok: true, quotation });
};

exports.updateQuotation = async (req, res) => {
  const gstError = validateGstNumber(req.body.leadDetails?.gstNumber);
  if (gstError) return res.status(400).json({ error: gstError });
  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

  // Every revision, including a one-field edit, starts a completely new approval cycle.
  // Client-supplied status is deliberately ignored.
  const data = cleanBody(req.body, req.user);
  const termsError = validatePaymentTerms(data.terms);
  if (termsError) return res.status(400).json({ error: termsError });
  try {
    validateQuotationItemDates(data.items);
    await validateQuotationPiboItems(data.items);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
  const previous = quotation.toObject();
  const labels = {
    leadId: 'Lead', leadCode: 'Lead Code', companyName: 'Company', leadDetails: 'Lead Details',
    quotationDate: 'Quotation Date', validUntil: 'Valid Until', items: 'Quotation Items', terms: 'Terms', scopeOfWork: 'Scope of Work',
    subtotal: 'Subtotal', grandTotal: 'Grand Total'
  };
  const changes = Object.keys(labels).filter((field) => JSON.stringify(previous[field] ?? null) !== JSON.stringify(data[field] ?? null)).map((field) => ({
    field,
    label: labels[field],
    before: previous[field] ?? null,
    after: data[field] ?? null
  }));
  Object.assign(quotation, data);
  Object.assign(quotation, await resolveCrmRelationships(data));
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
  await sendQuotationLifecycleEmail({ quotation, event: 'revised', actor: req.user })
    .catch((error) => console.error('[Quotation lifecycle email] revision failed', error));
  res.json({ ok: true, quotation });
};

exports.updateQuotationApproval = async (req, res) => {
  const status = normalizeApprovalStatus(req.body.status || req.body.approvalStatus);
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Approval status must be APPROVED or REJECTED' });
  }

  const approvalRecordId = String(req.body.approvalRecordId || '').trim();
  const approvalRecord = require('mongoose').Types.ObjectId.isValid(approvalRecordId)
    ? await PendingApproval.findById(approvalRecordId)
    : null;
  const update = {
    approvalStatus: status,
    nextReminderAt: null,
    actionBy: req.user?._id,
    actionAt: new Date(),
    remarks: String(req.body.remarks || '').trim()
  };
  const requestedId = String(req.params.id || '').trim();
  const resolvedQuotationId = require('mongoose').Types.ObjectId.isValid(requestedId)
    ? requestedId
    : String(approvalRecord?.sourceClientId || approvalRecord?.payload?.quotationId || '').trim();
  const quotation = require('mongoose').Types.ObjectId.isValid(resolvedQuotationId)
    ? await Quotation.findById(resolvedQuotationId).populate('createdBy', 'name email')
    : null;

  if (!quotation) {
    return res.status(404).json({ error: 'Linked quotation not found. Refresh Pending Approval and try again.' });
  }

  quotation.status = status === 'APPROVED' ? 'approved' : 'rejected';
  await quotation.save();

  await PendingApproval.updateMany(
    {
      type: 'quotation',
      $or: [
        ...(approvalRecord?._id ? [{ _id: approvalRecord._id }] : []),
        { sourceClientId: String(quotation._id) },
        { 'payload.quotationId': quotation._id },
        { 'payload.quotationId': String(quotation._id) }
      ]
    },
    { $set: update }
  );

  await sendQuotationLifecycleEmail({
    quotation,
    event: status === 'APPROVED' ? 'approved' : 'rejected',
    actor: req.user
  }).catch((error) => console.error('[Quotation lifecycle email] decision failed', error));

  res.json({ ok: true, approvalStatus: status, quotation });
};

exports.bulkCreateQuotations = async (req, res) => {
  const rows = Array.isArray(req.body.quotations) ? req.body.quotations : [];
  if (!rows.length) return res.status(400).json({ error: 'At least one quotation is required.' });
  if (rows.length > 1000) return res.status(400).json({ error: 'A maximum of 1,000 quotations can be imported at once.' });

  const summary = { total: rows.length, created: 0, updated: 0, failed: 0 };
  const failures = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    try {
      const gstError = validateGstNumber(row.leadDetails?.gstNumber);
      if (gstError) throw new Error(gstError);
      const data = cleanBody(row, req.user);
      if (!data.companyName) throw new Error('Company Name is required');
      if (!data.items.length) throw new Error('At least one quotation item is required');
      validateQuotationItemDates(data.items);
      await validateQuotationPiboItems(data.items);
      const quotationNumber = cleanString(row.quotationNumber) || await nextQuotationNumber();
      const existing = await Quotation.findOne({ quotationNumber });
      let quotation;
      if (existing) {
        Object.assign(existing, data, await resolveCrmRelationships(data), { source: 'bulk', status: 'draft' });
        quotation = await existing.save();
        summary.updated += 1;
      } else {
        quotation = await Quotation.create({
          ...data,
          ...await resolveCrmRelationships(data),
          quotationNumber,
          source: 'bulk',
          status: 'draft',
          createdBy: req.user?._id
        });
        summary.created += 1;
      }
      await upsertQuotationPendingApproval(quotation, existing ? 'UPDATE' : 'CREATE');
      await quotation.populate('createdBy', 'name email');
      await sendQuotationLifecycleEmail({
        quotation,
        event: existing ? 'revised' : 'created',
        actor: req.user
      }).catch((error) => console.error('[Quotation lifecycle email] bulk row failed', error));
    } catch (error) {
      summary.failed += 1;
      failures.push({
        row: index + 2,
        quotationNumber: cleanString(row.quotationNumber),
        companyName: cleanString(row.companyName || row.leadDetails?.companyName),
        error: error.message || 'Import failed'
      });
    }
  }
  return res.status(summary.failed === summary.total ? 400 : 200).json({
    ok: summary.failed === 0,
    summary,
    failures
  });
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
        await quotation.populate('createdBy', 'name email');
      }
      record.approvalStatus = 'APPROVED';
      record.nextReminderAt = null;
      record.actionBy = req.user?._id;
      record.actionAt = new Date();
      record.remarks = remarks;
      await record.save();
      if (quotation) {
        await sendQuotationLifecycleEmail({
          quotation,
          event: 'approved',
          actor: req.user
        }).catch((error) => console.error('[Quotation lifecycle email] bulk approval failed', error));
      }
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
  await ensureBuiltInServiceCategories();
  const categories = await QuotationServiceCategory.find().sort({ name: 1 }).lean();
  res.json({ categories: categories.map((category) => category.name) });
};

exports.createServiceCategory = async (req, res) => {
  await ensureBuiltInServiceCategories();
  const name = normalizeServiceCategoryName(req.body.name);
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
  preserveTerminalApprovalStatus
};

exports.listDropdownOptions = async (req, res) => {
  const options = await QuotationDropdownOption.find().sort({ field: 1, name: 1 }).lean();
  return res.json({ options: options.map((option) => ({ field: option.field, name: option.name })) });
};

exports.createDropdownOption = async (req, res) => {
  const field = cleanString(req.body.field);
  if (!QuotationDropdownOption.ALLOWED_FIELDS.includes(field)) {
    return res.status(400).json({ error: 'Unsupported quotation dropdown.' });
  }
  const rawName = cleanString(req.body.name).replace(/\s+/g, ' ');
  const name = field === 'servicesForYear' ? rawName : rawName.toUpperCase();
  if (!name) return res.status(400).json({ error: 'Option name is required.' });
  if (name.length > 100) return res.status(400).json({ error: 'Option name must be 100 characters or fewer.' });

  try {
    const option = await QuotationDropdownOption.create({
      field,
      name,
      normalizedName: name.toLowerCase(),
      createdBy: req.user?._id
    });
    return res.status(201).json({ option: { field: option.field, name: option.name } });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This option already exists.' });
    throw error;
  }
};
