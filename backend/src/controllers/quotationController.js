const Quotation = require('../models/Quotation');
const PendingApproval = require('../models/PendingApproval');

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
  'pinCode'
];

function cleanString(value) {
  return String(value || '').trim();
}

function cleanLeadDetails(value = {}) {
  return LEAD_DETAIL_FIELDS.reduce((data, field) => {
    data[field] = cleanString(value[field]);
    return data;
  }, {});
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      serviceCategory: cleanString(item.serviceCategory),
      servicesForYear: cleanString(item.servicesForYear),
      eprCategory: cleanString(item.eprCategory),
      piboCategory: cleanString(item.piboCategory),
      unit: cleanString(item.unit),
      basicAmount: Number(item.basicAmount) || 0
    }))
    .filter((item) => Object.values(item).some((value) => String(value || '').trim() !== '' && value !== 0));
}

function cleanTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms.map(cleanString).filter(Boolean);
}

function cleanBody(body) {
  return {
    leadId: cleanString(body.leadId),
    leadCode: cleanString(body.leadCode),
    leadDetails: cleanLeadDetails(body.leadDetails),
    validUntil: cleanString(body.validUntil),
    items: cleanItems(body.items),
    terms: cleanTerms(body.terms),
    status: ['draft', 'sent', 'approved', 'rejected'].includes(body.status) ? body.status : 'draft'
  };
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
  const record = await PendingApproval.findOneAndUpdate(
    { type: 'quotation', source: 'crm', sourceClientId: String(quotation._id) },
    {
      $setOnInsert: {
        type: 'quotation',
        source: 'crm',
        sourceClientId: String(quotation._id),
        uniqueId: row.uniqueId,
        nextReminderAt: status === 'PENDING' ? new Date() : null
      },
      $set: {
        clientName: row.companyName,
        approvalStatus: status,
        piboCategory: row.piboCategory,
        eprCategory: row.category,
        createdByName: row.createdBy,
        requestDate: row.requestDate,
        requestTime: row.requestTime,
        payload: row
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return record;
}

async function nextQuotationNumber() {
  const prefix = 'ATPL-QTN-';
  const latest = await Quotation.findOne({ quotationNumber: { $exists: true, $ne: '' } })
    .sort({ quotationNumber: -1 })
    .select('quotationNumber')
    .lean();
  const next = (Number.parseInt(String(latest?.quotationNumber || '').replace(prefix, ''), 10) || 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

exports.listQuotations = async (req, res) => {
  const quotations = await Quotation.find()
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ ok: true, quotations });
};

exports.createQuotation = async (req, res) => {
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
  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

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
