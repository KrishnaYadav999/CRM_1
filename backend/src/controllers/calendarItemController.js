const mongoose = require('mongoose');
const CalendarItem = require('../models/CalendarItem');

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

exports.listCalendarItems = async (req, res) => {
  const items = await CalendarItem.find()
    .sort({ scheduledDate: 1, scheduledTime: 1, createdAt: -1 })
    .lean();
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
  res.status(201).json({ ok: true, item: mapItem(item) });
};

exports.updateCalendarItem = async (req, res) => {
  const item = await findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar item not found' });

  const data = buildItemData({ ...req.body, id: item.externalId || req.params.id }, req.user);
  if (!data.title) return res.status(400).json({ error: 'Title is required' });
  Object.assign(item, data);
  await item.save();
  res.json({ ok: true, item: mapItem(item) });
};

exports.deleteCalendarItem = async (req, res) => {
  const item = await findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar item not found' });
  await item.deleteOne();
  res.json({ ok: true });
};

module.exports.__test = { buildItemData, mapItem };
