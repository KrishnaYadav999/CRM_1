const Lead = require('../models/Lead');
const LeadActivity = require('../models/LeadActivity');
const Sequence = require('../models/Sequence');
const TemporaryLead = require('../models/TemporaryLead');
const CalendarItem = require('../models/CalendarItem');
const { normalizeCompanyIdentity } = require('../services/crmRecordPersistence');
const { createLeadRecordInternal } = require('./leadController');

async function nextTemporaryLeadCode() {
  const sequence = await Sequence.findOneAndUpdate(
    { key: 'temporary_lead' },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `ATPL-TEMP-${String(sequence.value).padStart(4, '0')}`;
}

exports.list = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim().toUpperCase();
  const filter = {};
  if (search) filter.$or = [
    { tempLeadCode: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    { clientName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
  ];
  if (['DRAFT', 'CONVERTED'].includes(status)) filter.status = status;
  const [rows, total, draftCount, convertedCount] = await Promise.all([
    TemporaryLead.find(filter).populate('createdBy', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    TemporaryLead.countDocuments(filter),
    TemporaryLead.countDocuments({ status: 'DRAFT' }),
    TemporaryLead.countDocuments({ status: 'CONVERTED' })
  ]);
  res.json({ ok: true, temporaryLeads: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, counts: { total: draftCount + convertedCount, draft: draftCount, converted: convertedCount } });
};

exports.create = async (req, res) => {
  const clientName = String(req.body.clientName || '').trim().replace(/\s+/g, ' ');
  if (clientName.length < 2) return res.status(400).json({ error: 'Client name must contain at least 2 characters.' });
  if (clientName.length > 240) return res.status(400).json({ error: 'Client name must be 240 characters or fewer.' });
  const row = await TemporaryLead.create({
    tempLeadCode: await nextTemporaryLeadCode(),
    clientName,
    companyIdentity: normalizeCompanyIdentity(clientName),
    createdBy: req.user._id,
    createdByName: req.user.name || req.user.email,
    createdByEmail: req.user.email
  });
  res.status(201).json({ ok: true, temporaryLead: row });
};

exports.convert = async (req, res) => {
  const row = await TemporaryLead.findById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Temporary lead not found.' });
  if (row.status === 'CONVERTED') {
    const lead = row.convertedLead ? await Lead.findById(row.convertedLead).lean() : null;
    return res.json({ ok: true, temporaryLead: row, lead, alreadyConverted: true });
  }
  const duplicate = await Lead.findOne({ companyIdentity: row.companyIdentity }).select('_id leadCode company').lean();
  if (duplicate) return res.status(409).json({ error: `${duplicate.company} already exists as ${duplicate.leadCode}.`, code: 'DUPLICATE_LEAD_COMPANY', duplicate });
  const lead = await createLeadRecordInternal({ company: row.clientName, status: 'Potential - Interested', workflowStatus: 'draft', source: 'Temporary Lead', notes: `Converted from ${row.tempLeadCode}` }, req.user);
  await LeadActivity.create({ lead: lead._id, type: 'lead_created', title: 'Lead created from temporary lead', description: `${row.tempLeadCode} converted for ${row.clientName}`, actor: req.user._id });
  row.status = 'CONVERTED'; row.convertedLead = lead._id; row.convertedLeadCode = lead.leadCode; row.convertedAt = new Date();
  await row.save();
  res.status(201).json({ ok: true, temporaryLead: row, lead });
};

exports.saveFollowUp = async (req, res) => {
  const row = await TemporaryLead.findById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Temporary lead not found.' });
  if (row.status === 'CONVERTED') return res.status(409).json({ error: 'Converted temporary leads must be followed up from the permanent Lead.' });
  const scheduledDate = String(req.body.scheduledDate || '').trim();
  const scheduledTime = String(req.body.scheduledTime || '').trim();
  const remarks = String(req.body.remarks || '').trim();
  const priority = String(req.body.priority || 'Medium').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !remarks) return res.status(400).json({ error: 'Follow-up date and remarks are required.' });
  const now = new Date().toISOString();
  if (!Array.isArray(row.followUpHistory)) row.followUpHistory = [];
  if (row.nextFollowUpDate || row.nextFollowUpTime || row.followUpRemarks) row.followUpHistory.unshift({ scheduledDate: row.nextFollowUpDate, scheduledTime: row.nextFollowUpTime, remarks: row.followUpRemarks, priority: row.followUpPriority, status: 'updated', updatedAt: now, updatedBy: req.user.name || req.user.email });
  row.nextFollowUpDate = scheduledDate; row.nextFollowUpTime = scheduledTime; row.followUpRemarks = remarks; row.followUpPriority = priority;
  const calendarItem = await CalendarItem.create({ externalId: `temp-followup-${row._id}-${Date.now()}`, type: 'followup', category: 'Follow-Up', title: `Temporary lead follow-up: ${row.clientName}`, description: remarks, clientName: row.clientName, leadNumber: row.tempLeadCode, leadCompanyName: row.clientName, temporaryLeadId: String(row._id), scheduledDate, scheduledTime, priority, status: 'open', assignedTo: String(req.user._id), assignedToId: String(req.user._id), assignedToName: req.user.name || req.user.email, assignedToEmail: req.user.email || '', createdBy: req.user.name || req.user.email, createdByUser: req.user._id, source: 'temporary-lead' });
  row.followUpHistory.unshift({ calendarItemId: String(calendarItem._id), scheduledDate, scheduledTime, remarks, priority, status: 'open', createdAt: now, createdBy: req.user.name || req.user.email });
  await row.save();
  res.json({ ok: true, temporaryLead: row, calendarItem });
};

exports.__test = { nextTemporaryLeadCode };
