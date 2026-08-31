const mongoose = require('mongoose');
const CalendarItem = require('../models/CalendarItem');
const Lead = require('../models/Lead');
const TemporaryLead = require('../models/TemporaryLead');

function readItemId(value) {
  return String(value || '').trim();
}

function buildItemData(body = {}, user) {
  const data = { ...body };
  const externalId = readItemId(data.id || data.externalId);
  delete data.id;
  delete data._id;
  if (externalId) data.externalId = externalId;
  data.title = String(data.title || '').trim();
  data.description = String(data.description || '').trim();
  data.clientKey = String(data.clientKey || '').trim();
  data.clientNumber = String(data.clientNumber || '').trim();
  data.clientName = String(data.clientName || '').trim();
  data.leadNumber = String(data.leadNumber || '').trim();
  data.leadCompanyName = String(data.leadCompanyName || '').trim();
  data.updateReason = String(data.updateReason || '').trim();
  data.priority = String(data.priority || 'Medium').trim() || 'Medium';
  data.category = String(data.category || 'General').trim() || 'General';
  data.scheduledDate = String(data.scheduledDate || '').trim();
  data.scheduledTime = String(data.scheduledTime || '').trim();
  data.assignedTo = String(data.assignedTo || '').trim();
  data.assignedToName = String(data.assignedToName || '').trim();
  data.assignedToEmail = String(data.assignedToEmail || '').trim();
  data.assignedToId = String(data.assignedToId || '').trim();
  data.status = String(data.status || 'open').trim() || 'open';
  data.type = String(data.type || 'todo').trim() || 'todo';
  data.createdBy = String(data.createdBy || user?.name || user?.email || '').trim();
  data.createdByUser = data.createdByUser || user?._id;
  data.source = String(data.source || 'crm').trim() || 'crm';
  data.history = Array.isArray(data.history) ? data.history : [];
  data.assignmentHistory = Array.isArray(data.assignmentHistory) ? data.assignmentHistory : [];
  data.completionHistory = Array.isArray(data.completionHistory) ? data.completionHistory : [];
  return data;
}

function mapItem(item) {
  const raw = typeof item.toObject === 'function' ? item.toObject() : item;
  return {
    ...raw,
    id: raw.externalId || String(raw._id),
    _id: raw._id
  };
}

async function findItem(id) {
  const value = readItemId(id);
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) {
    const byId = await CalendarItem.findById(value);
    if (byId) return byId;
  }
  return CalendarItem.findOne({ externalId: value });
}

function isFollowUpItem(item = {}) {
  const type = String(item.type || '').trim().toLowerCase();
  const category = String(item.category || '').trim().toLowerCase();
  return type === 'followup' || type === 'follow-up' || category === 'follow-up';
}

function sameFollowUpSchedule(service = {}, item = {}) {
  const serviceDate = String(service.nextFollowUpDate || '').trim();
  const itemDate = String(item.scheduledDate || '').trim();
  if (!serviceDate || !itemDate || serviceDate !== itemDate) return false;
  const serviceTime = String(service.nextFollowUpTime || '').trim();
  const itemTime = String(item.scheduledTime || '').trim();
  return !serviceTime || !itemTime || serviceTime === itemTime;
}

function resolveServiceIndex(services = [], item = {}) {
  const assignedServiceId = String(item.metadata?.assignedServiceId || item.assignedServiceId || '').trim();
  if (assignedServiceId) {
    const assignedIndex = services.findIndex((service) => String(service?.assignedServiceId || '').trim() === assignedServiceId);
    if (assignedIndex >= 0) return assignedIndex;
  }
  const requestedIndex = Number(item.metadata?.serviceIndex);
  const scheduledIndex = services.findIndex((service) => sameFollowUpSchedule(service, item));
  if (scheduledIndex >= 0) return scheduledIndex;
  if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && services[requestedIndex] && !item.scheduledDate) return requestedIndex;
  return services.length === 1 ? 0 : -1;
}

function applyCalendarFollowUpClosure(lead, item, user) {
  const services = Array.isArray(lead?.serviceSelections) ? lead.serviceSelections : [];
  const serviceIndex = resolveServiceIndex(services, item);
  if (serviceIndex < 0) return false;

  const calendarItemId = String(item._id || item.externalId || '').trim();
  const service = services[serviceIndex] || {};
  const history = Array.isArray(service.followUpHistory) ? service.followUpHistory : [];
  if (calendarItemId && history.some((entry) => String(entry.calendarItemId || '') === calendarItemId)) return false;

  const closedAt = String(item.completedAt || new Date().toISOString());
  const closedBy = user?.name || user?.email || item.assignedToName || 'CRM User';
  const clearsCurrent = sameFollowUpSchedule(service, item);
  const closedEntry = {
    id: `calendar-follow-up-closed-${calendarItemId || Date.now()}`,
    calendarItemId,
    scheduledDate: item.scheduledDate || service.nextFollowUpDate || '',
    scheduledTime: item.scheduledTime || service.nextFollowUpTime || '',
    remarks: item.completionRemarks || 'Follow-up closed from Calendar',
    previousRemarks: clearsCurrent ? (service.followUpRemarks || '') : '',
    reason: item.completionRemarks || 'Closed from Calendar',
    priority: item.priority || service.followUpPriority || 'Medium',
    status: 'closed', closedAt, closedBy, createdAt: closedAt, updatedAt: closedAt
  };
  lead.serviceSelections = services.map((row, index) => index === serviceIndex ? {
    ...row,
    ...(clearsCurrent ? {
      nextFollowUpDate: '', nextFollowUpTime: '', followUpRemarks: '', followUpFlag: 'GREEN',
      followUpClosedAt: closedAt, followUpClosedBy: closedBy, followUpCloseReason: closedEntry.reason,
      followUpUpdatedAt: closedAt
    } : {}),
    followUpHistory: [closedEntry, ...history]
  } : row);
  if (clearsCurrent) {
    lead.followUpFlag = 'GREEN';
    // Older leads also keep the current follow-up on the lead itself. Clear
    // those fields together with the service row so the detail page cannot
    // rebuild a stale "Upcoming" card after the calendar item is completed.
    if (sameFollowUpSchedule({
      nextFollowUpDate: lead.nextFollowUpDate,
      nextFollowUpTime: lead.nextFollowUpTime
    }, item)) {
      lead.nextFollowUpDate = '';
      lead.nextFollowUpTime = '';
      lead.followUpRemarks = '';
    }
  }
  return true;
}

async function closeLinkedLeadFollowUp(item, user) {
  const raw = typeof item.toObject === 'function' ? item.toObject() : item;
  if (String(raw.status || '').toLowerCase() !== 'completed' || !isFollowUpItem(raw)) return null;
  if (raw.temporaryLeadId && mongoose.Types.ObjectId.isValid(String(raw.temporaryLeadId))) {
    const temporaryLead = await TemporaryLead.findById(raw.temporaryLeadId);
    if (!temporaryLead) return null;
    const closedAt = String(raw.completedAt || new Date().toISOString());
    if (!Array.isArray(temporaryLead.followUpHistory)) temporaryLead.followUpHistory = [];
    temporaryLead.followUpHistory.unshift({ calendarItemId: String(raw._id || ''), scheduledDate: raw.scheduledDate || temporaryLead.nextFollowUpDate || '', scheduledTime: raw.scheduledTime || temporaryLead.nextFollowUpTime || '', remarks: raw.completionRemarks || temporaryLead.followUpRemarks || 'Follow-up completed', priority: raw.priority || temporaryLead.followUpPriority || 'Medium', status: 'closed', closedAt, closedBy: user?.name || user?.email || raw.assignedToName || 'CRM User' });
    temporaryLead.nextFollowUpDate = ''; temporaryLead.nextFollowUpTime = ''; temporaryLead.followUpRemarks = ''; temporaryLead.followUpFlag = 'GREEN';
    await temporaryLead.save();
    return temporaryLead;
  }
  const leadId = String(raw.leadId || '').trim();
  const lookups = [];
  if (leadId) {
    if (mongoose.Types.ObjectId.isValid(leadId)) lookups.push({ _id: leadId });
    lookups.push({ sourceLeadId: leadId }, { externalLeadId: leadId });
  }
  if (raw.leadNumber) lookups.push({ leadCode: String(raw.leadNumber).trim() });
  const companyName = String(raw.leadCompanyName || raw.clientName || '').trim();
  if (companyName) lookups.push({ company: companyName });
  const lead = lookups.length ? await Lead.findOne({ $or: lookups }) : null;
  if (!lead || !Array.isArray(lead.serviceSelections)) return;
  if (!applyCalendarFollowUpClosure(lead, raw, user)) return lead;
  lead.markModified('serviceSelections');
  await lead.save();
  return lead;
}

async function scheduleLinkedLeadFollowUp(item, user) {
  const raw = typeof item.toObject === 'function' ? item.toObject() : item;
  if (!isFollowUpItem(raw) || String(raw.status || '').toLowerCase() === 'completed') return null;
  const temporaryLookup = [];
  if (raw.temporaryLeadId && mongoose.Types.ObjectId.isValid(String(raw.temporaryLeadId))) temporaryLookup.push({ _id: raw.temporaryLeadId });
  if (/^ATPL-TEMP-/i.test(String(raw.leadNumber || ''))) temporaryLookup.push({ tempLeadCode: String(raw.leadNumber).trim() });
  if (temporaryLookup.length) {
    const temporaryLead = await TemporaryLead.findOne({ $or: temporaryLookup });
    if (!temporaryLead) return null;
    if (!Array.isArray(temporaryLead.followUpHistory)) temporaryLead.followUpHistory = [];
    const calendarItemId = String(raw._id || raw.externalId || '');
    temporaryLead.followUpHistory = temporaryLead.followUpHistory.map((entry) => String(entry.status || '').toLowerCase() === 'open' && String(entry.calendarItemId || '') !== calendarItemId ? { ...entry, status: 'updated', updatedAt: new Date().toISOString(), updatedBy: user?.name || user?.email || raw.createdBy || '' } : entry);
    if (!temporaryLead.followUpHistory.some((entry) => String(entry.calendarItemId || '') === calendarItemId)) temporaryLead.followUpHistory.unshift({ calendarItemId, scheduledDate: raw.scheduledDate || '', scheduledTime: raw.scheduledTime || '', remarks: raw.updateReason || raw.description || raw.title || '', priority: raw.priority || 'Medium', status: 'open', createdAt: new Date().toISOString(), createdBy: user?.name || user?.email || raw.createdBy || '' });
    temporaryLead.nextFollowUpDate = raw.scheduledDate || '';
    temporaryLead.nextFollowUpTime = raw.scheduledTime || '';
    temporaryLead.followUpRemarks = raw.updateReason || raw.description || raw.title || '';
    temporaryLead.followUpPriority = raw.priority || 'Medium';
    temporaryLead.followUpFlag = 'GREEN';
    await temporaryLead.save();
    return temporaryLead;
  }
  const lookups = [];
  const leadId = String(raw.leadId || '').trim();
  if (leadId && mongoose.Types.ObjectId.isValid(leadId)) lookups.push({ _id: leadId });
  if (raw.leadNumber) lookups.push({ leadCode: String(raw.leadNumber).trim() }, { sourceLeadId: String(raw.leadNumber).trim() });
  const lead = lookups.length ? await Lead.findOne({ $or: lookups }) : null;
  if (!lead || !Array.isArray(lead.serviceSelections) || !lead.serviceSelections.length) return null;
  const serviceIndex = resolveServiceIndex(lead.serviceSelections, raw);
  const index = serviceIndex >= 0 ? serviceIndex : 0;
  const service = lead.serviceSelections[index] || {};
  lead.serviceSelections = lead.serviceSelections.map((row, rowIndex) => rowIndex === index ? {
    ...row,
    nextFollowUpDate: raw.scheduledDate || '', nextFollowUpTime: raw.scheduledTime || '',
    followUpRemarks: raw.updateReason || raw.description || raw.title || '',
    followUpPriority: raw.priority || 'Medium', followUpFlag: 'GREEN',
    followUpUpdatedAt: new Date().toISOString(), followUpUpdatedBy: user?.name || user?.email || raw.createdBy || '',
    calendarItemId: String(raw._id || raw.externalId || '')
  } : row);
  if (index === 0) {
    lead.nextFollowUpDate = raw.scheduledDate || '';
    lead.nextFollowUpTime = raw.scheduledTime || '';
    lead.followUpRemarks = raw.updateReason || raw.description || raw.title || '';
    lead.followUpPriority = raw.priority || 'Medium';
    lead.followUpFlag = 'GREEN';
  }
  lead.markModified('serviceSelections');
  await lead.save();
  return lead;
}

exports.listCalendarItems = async (req, res) => {
  const items = await CalendarItem.find()
    .sort({ scheduledDate: 1, scheduledTime: 1, createdAt: -1 })
    .lean();
  // Idempotently repair follow-ups completed before lead/calendar syncing was
  // introduced. This makes historical completed cards move to Previous on the
  // next calendar refresh without requiring a database migration.
  await Promise.all(items
    .filter((item) => String(item.status || '').toLowerCase() === 'completed' && isFollowUpItem(item))
    .map((item) => closeLinkedLeadFollowUp(item, req.user).catch(() => null)));
  res.json({ ok: true, items: items.map(mapItem) });
};

exports.createCalendarItem = async (req, res) => {
  const data = buildItemData(req.body, req.user);
  if (!data.title) return res.status(400).json({ error: 'Title is required' });

  let item = data.externalId ? await CalendarItem.findOne({ externalId: data.externalId }) : null;
  if (item) {
    Object.assign(item, data);
    await item.save();
    return res.json({ ok: true, item: mapItem(item) });
  }

  if (!data.externalId) data.externalId = `${data.type || 'todo'}-${Date.now()}`;
  item = await CalendarItem.create(data);
  const syncedLead = await scheduleLinkedLeadFollowUp(item, req.user);
  res.status(201).json({ ok: true, item: mapItem(item), lead: syncedLead || undefined });
};

exports.updateCalendarItem = async (req, res) => {
  const item = await findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar item not found' });

  const data = buildItemData({ ...req.body, id: item.externalId || req.params.id }, req.user);
  if (!data.title) return res.status(400).json({ error: 'Title is required' });
  Object.assign(item, data);
  await item.save();
  const syncedLead = String(item.status || '').toLowerCase() === 'completed'
    ? await closeLinkedLeadFollowUp(item, req.user)
    : await scheduleLinkedLeadFollowUp(item, req.user);
  res.json({ ok: true, item: mapItem(item), lead: syncedLead || undefined });
};

exports.deleteCalendarItem = async (req, res) => {
  const item = await findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar item not found' });
  await item.deleteOne();
  res.json({ ok: true });
};

module.exports.__test = { buildItemData, mapItem, isFollowUpItem, sameFollowUpSchedule, resolveServiceIndex, applyCalendarFollowUpClosure, closeLinkedLeadFollowUp, scheduleLinkedLeadFollowUp };
