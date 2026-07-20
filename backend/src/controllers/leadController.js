const Lead = require('../models/Lead');
const mongoose = require('mongoose');
const LeadActivity = require('../models/LeadActivity');
const Quotation = require('../models/Quotation');
const PendingApproval = require('../models/PendingApproval');
const CalendarItem = require('../models/CalendarItem');
const { getVisibleUserScope, ownerFilter } = require('../utils/visibilityScope');
const { normalizeParent, inferPiboParent, validatePiboSelection } = require('../utils/piboCategories');

const REQUIRED_FIELDS = ['status', 'company', 'piboCategory', 'servicesOffered', 'addressLine1', 'state', 'city', 'pinCode'];
const LEAD_CODE_PREFIX = 'ATPL-LEAD-';

function cleanBody(body) {
  const data = {};
  [
    'communicationMode',
    'sourceLeadId',
    'status',
    'company',
    'industryType',
    'eprCategory',
    'piboParent',
    'piboCategoryParent',
    'piboCategory',
    'servicesOffered',
    'addressLine1',
    'addressLine2',
    'addressLine3',
    'landmark',
    'state',
    'city',
    'pinCode',
    'existingClient',
    'website',
    'salutation',
    'contactPerson',
    'designation',
    'emails',
    'emailsSentCount',
    'lastEmailSent',
    'mobileNo1',
    'mobileNo2',
    'businessCardUrl',
    'referredBy',
    'source',
    'notes',
    'assignedTo',
    'assignedToText',
    'assignedBy',
    'importedCreatedBy',
    'leadDate',
    'nextFollowUpDate',
    'nextFollowUpTime',
    'followUpRemarks',
    'followUpHistory',
    'importedCreatedAt',
    'importedUpdatedAt',
    'workflowStatus'
  ].forEach((key) => {
    if (body[key] !== undefined) {
      const value = typeof body[key] === 'string' ? body[key].trim() : body[key];
      if (key === 'assignedTo' && !value) return;
      data[key] = key === 'emailsSentCount' ? Number(value) || 0 : value;
      if (key === 'followUpHistory') data[key] = Array.isArray(value) ? value : [];
    }
  });
  data.piboParent = normalizeParent(data.piboParent || data.piboCategoryParent) || inferPiboParent(data.piboCategory) || undefined;
  delete data.piboCategoryParent;
  return data;
}

function validateSubmittedLead(data) {
  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length) return `Missing required fields: ${missing.join(', ')}`;
  return '';
}

async function getNextLeadCode() {
  const latest = await Lead.findOne({ leadCode: { $exists: true, $ne: '' } })
    .sort({ leadCode: -1 })
    .select('leadCode')
    .lean();
  const latestNumber = Number.parseInt(String(latest?.leadCode || '').replace(LEAD_CODE_PREFIX, ''), 10) || 0;
  return `${LEAD_CODE_PREFIX}${String(latestNumber + 1).padStart(4, '0')}`;
}

async function createLeadRecord(rawBody, userId) {
  const data = cleanBody(rawBody);
  data.workflowStatus = data.workflowStatus === 'submitted' ? 'submitted' : 'draft';

  if (data.workflowStatus === 'submitted' || data.piboParent || data.piboCategory) {
    const selection = await validatePiboSelection({ parent: data.piboParent, child: data.piboCategory, required: true });
    data.piboParent = selection.piboParent;
    data.piboCategory = selection.piboCategory;
  }

  if (data.workflowStatus === 'submitted') {
    const error = validateSubmittedLead(data);
    if (error) {
      const validationError = new Error(error);
      validationError.statusCode = 400;
      throw validationError;
    }
  }

  return Lead.create({ ...data, leadCode: await getNextLeadCode(), createdBy: userId });
}

exports.listLeads = async (req, res) => {
  const scope = await getVisibleUserScope(req.user);
  const leads = await Lead.find(ownerFilter(scope, 'createdBy', 'assignedTo', [
    'assignedToText'
  ]))
    .populate('assignedTo', 'name email avatarUrl role')
    .sort({ leadCode: 1, createdAt: 1 });
  res.json({ ok: true, leads });
};

exports.createLead = async (req, res) => {
  try {
    const lead = await createLeadRecord(req.body, req.user?._id);
    await LeadActivity.create({ lead: lead._id, type: 'lead_created', title: 'Lead created', description: `Lead created for ${lead.company || lead.leadCode}`, actor: req.user?._id });
    res.status(201).json({ ok: true, lead });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to save lead' });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const data = cleanBody(req.body);
    data.workflowStatus = data.workflowStatus === 'submitted' ? 'submitted' : (data.workflowStatus || lead.workflowStatus || 'draft');

    if (data.workflowStatus === 'submitted') {
      const error = validateSubmittedLead({ ...lead.toObject(), ...data });
      if (error) return res.status(400).json({ error });
    }

    if (data.workflowStatus === 'submitted' || data.piboParent || data.piboCategory) {
      const current = lead.toObject();
      const selection = await validatePiboSelection({
        parent: data.piboParent || current.piboParent || current.piboCategoryParent,
        child: data.piboCategory || current.piboCategory,
        required: true
      });
      data.piboParent = selection.piboParent;
      data.piboCategory = selection.piboCategory;
    }

    Object.assign(lead, data);
    await lead.save();
    const changedFields = Object.keys(data).filter((key) => key !== 'followUpHistory');
    await LeadActivity.create({ lead: lead._id, type: 'lead_updated', title: 'Lead updated', description: changedFields.length ? `Updated ${changedFields.join(', ')}` : 'Lead details updated', actor: req.user?._id, metadata: { changedFields } });
    res.json({ ok: true, lead });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to update lead' });
  }
};

exports.recordIntroductionEmail = async (req, res) => {
  const lead = mongoose.isValidObjectId(req.params.id) ? await Lead.findById(req.params.id) : await Lead.findOne({ sourceLeadId: req.params.id });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const recipient = String(req.body.recipient || lead.emails || '').trim();
  await LeadActivity.create({ lead: lead._id, type: 'email_sent', title: 'Introduction email opened', description: recipient ? `Introduction email prepared for ${recipient}` : 'Introduction email action opened', actor: req.user?._id, metadata: { recipient } });
  res.status(201).json({ ok: true });
};

exports.getLeadHistory = async (req, res) => {
  const lookup = [{ sourceLeadId: req.params.id }];
  if (req.query.leadCode) lookup.push({ leadCode: String(req.query.leadCode).trim() });
  if (mongoose.isValidObjectId(req.params.id)) lookup.push({ _id: req.params.id });
  const storedLead = await Lead.findOne({ $or: lookup }).populate('createdBy', 'name email').lean();
  const lead = storedLead || { leadCode: String(req.query.leadCode || '').trim(), company: String(req.query.company || '').trim(), sourceLeadId: req.params.id };
  const ids = [lead._id, lead.sourceLeadId, req.params.id].filter(Boolean).map(String);
  const company = String(lead.company || req.query.company || '').trim();
  const quotationMatches = [{ leadId: { $in: ids } }];
  if (lead.leadCode) quotationMatches.push({ leadCode: lead.leadCode });
  if (company) quotationMatches.push({ 'leadDetails.companyName': company });
  const quotations = await Quotation.find({ $or: quotationMatches }).populate('createdBy', 'name email').lean();
  const quotationIds = quotations.map((item) => String(item._id));
  const calendarMatches = [];
  if (lead.leadCode) calendarMatches.push({ leadNumber: lead.leadCode });
  if (company) calendarMatches.push({ leadCompanyName: company });
  const [activities, approvals, calendarItems] = await Promise.all([
    lead._id ? LeadActivity.find({ lead: lead._id }).populate('actor', 'name email').lean() : Promise.resolve([]),
    PendingApproval.find({ type: 'quotation', sourceClientId: { $in: quotationIds } }).populate('actionBy', 'name email').lean(),
    calendarMatches.length ? CalendarItem.find({ $or: calendarMatches }).lean() : Promise.resolve([])
  ]);
  const events = activities.map((item) => ({ id: item._id, type: item.type, title: item.title, description: item.description, actor: item.actor?.name || item.actor?.email || item.actorName || 'CRM User', at: item.createdAt, metadata: item.metadata }));
  if (!activities.some((item) => item.type === 'lead_created') && (lead.createdAt || lead.importedCreatedAt)) events.push({ id: `created-${lead._id || req.params.id}`, type: 'lead_created', title: 'Lead created', description: `Lead ${lead.leadCode || ''} created for ${company}`, actor: lead.createdBy?.name || lead.createdBy?.email || lead.importedCreatedBy || 'Imported user', at: lead.createdAt || lead.importedCreatedAt });
  quotations.forEach((item) => events.push({ id: `quote-${item._id}`, type: 'quotation_created', title: 'Quotation created', description: `${item.quotationNumber || 'Quotation'} added with ${(item.items || []).length} item(s)`, actor: item.createdBy?.name || item.createdBy?.email || 'CRM User', at: item.createdAt, metadata: { quotationNumber: item.quotationNumber, status: item.status } }));
  approvals.forEach((item) => events.push({ id: `approval-${item._id}`, type: item.approvalStatus === 'APPROVED' ? 'quotation_approved' : item.approvalStatus === 'REJECTED' ? 'quotation_rejected' : 'approval_pending', title: item.approvalStatus === 'APPROVED' ? 'Quotation approved' : item.approvalStatus === 'REJECTED' ? 'Quotation rejected' : 'Quotation sent for approval', description: `${item.uniqueId || 'Quotation'} • ${item.remarks || item.approvalStatus}`, actor: item.actionBy?.name || item.actionBy?.email || item.createdByName || 'CRM User', at: item.actionAt || item.createdAt }));
  calendarItems.forEach((item) => {
    events.push({ id: `calendar-${item._id}`, type: item.type === 'followup' ? 'follow_up' : 'todo', title: item.type === 'followup' ? 'Follow-up scheduled' : 'Todo created', description: `${item.title}${item.scheduledDate ? ` • ${item.scheduledDate}${item.scheduledTime ? ` ${item.scheduledTime}` : ''}` : ''}`, actor: item.createdBy || item.assignedToName || 'CRM User', at: item.createdAt, metadata: { status: item.status, priority: item.priority } });
    (item.completionHistory || []).forEach((entry, index) => events.push({ id: `complete-${item._id}-${index}`, type: 'todo_completed', title: `${item.type === 'followup' ? 'Follow-up' : 'Todo'} completed`, description: entry.remarks || item.completionRemarks || item.title, actor: entry.by || item.assignedToName || 'CRM User', at: entry.at || item.completedAt || item.updatedAt }));
  });
  (lead.followUpHistory || []).forEach((item, index) => events.push({ id: `followup-${index}`, type: 'follow_up', title: 'Lead follow-up updated', description: item.remarks || item.followUpRemarks || 'Follow-up activity', actor: item.updatedBy || item.createdBy || 'CRM User', at: item.updatedAt || item.createdAt || item.date || lead.updatedAt }));
  events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  res.json({ ok: true, lead: { leadCode: lead.leadCode, company }, events, summary: { total: events.length, quotations: quotations.length, followUps: events.filter((item) => item.type === 'follow_up').length, todos: events.filter((item) => item.type.startsWith('todo')).length } });
};

exports.bulkCreateLeads = async (req, res) => {
  const rows = Array.isArray(req.body.leads) ? req.body.leads : [];
  if (!rows.length) return res.status(400).json({ error: 'No leads provided' });

  const leads = [];
  const failures = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const lead = await createLeadRecord(rows[index], req.user?._id);
      leads.push(lead);
    } catch (err) {
      failures.push({
        row: index + 1,
        error: err.message || 'Unable to save lead'
      });
    }
  }

  res.status(failures.length && !leads.length ? 400 : 201).json({
    ok: failures.length === 0,
    imported: leads.length,
    failed: failures.length,
    leads,
    failures
  });
};
