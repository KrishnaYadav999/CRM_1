const mongoose = require('mongoose');
const InternalTicket = require('../models/InternalTicket');

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

function cleanAttachments(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((item) => ({
    name: String(item?.name || '').trim().slice(0, 180), url: String(item?.secureUrl || item?.url || '').trim(),
    publicId: String(item?.publicId || '').trim().slice(0, 250), type: String(item?.type || '').trim().slice(0, 100),
    size: Math.max(0, Number(item?.size) || 0)
  })).filter((item) => /^https:\/\//i.test(item.url));
}

function canAccess(ticket, user) {
  const id = String(user?._id || '');
  return ['admin', 'superadmin'].includes(String(user?.role || '').toLowerCase())
    || String(ticket.createdBy?._id || ticket.createdBy) === id
    || (ticket.participants || []).some((participant) => String(participant?._id || participant) === id);
}

async function nextNumber() {
  const prefix = `INT-${new Date().getFullYear()}-`;
  const latest = await InternalTicket.findOne({ ticketNumber: new RegExp(`^${prefix}`) }).sort({ ticketNumber: -1 }).select('ticketNumber').lean();
  return `${prefix}${String((Number(String(latest?.ticketNumber || '').split('-').pop()) || 0) + 1).padStart(5, '0')}`;
}

exports.list = async (req, res) => {
  const admin = ['admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());
  // Conversations are private by default, including for administrators. Admins can
  // deliberately enter oversight mode with ?scope=all; this prevents unrelated
  // employee conversations from appearing in everyone's normal inbox.
  const oversight = admin && String(req.query.scope || '').toLowerCase() === 'all';
  const query = oversight ? {} : { $or: [{ createdBy: req.user._id }, { participants: req.user._id }] };
  const tickets = await InternalTicket.find(query).populate('createdBy participants', 'name email role avatarUrl').sort({ lastMessageAt: -1 }).lean();
  res.json({ ok: true, tickets, scope: oversight ? 'all' : 'mine' });
};

exports.detail = async (req, res) => {
  const ticket = await InternalTicket.findById(req.params.id).populate('createdBy participants', 'name email role avatarUrl').lean();
  if (!ticket) return res.status(404).json({ error: 'Internal ticket not found.' });
  if (!canAccess(ticket, req.user)) return res.status(403).json({ error: 'You cannot access this internal ticket.' });
  res.json({ ok: true, ticket });
};

exports.call = async (req, res) => {
  const ticket = await InternalTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Internal ticket not found.' });
  if (!canAccess(ticket, req.user)) return res.status(403).json({ error: 'You cannot access this internal ticket.' });
  const action = String(req.body.action || '').toLowerCase();
  if (action === 'start') {
    if (!['audio', 'video'].includes(req.body.mode) || !String(req.body.offer || '').trim()) return res.status(400).json({ error: 'Call mode and offer are required.' });
    ticket.callSession = { initiatedBy: req.user._id, initiatedByName: req.user.name || req.user.email, mode: req.body.mode, status: 'ringing', offer: String(req.body.offer), answer: '', startedAt: new Date() };
  } else if (action === 'answer') {
    if (!ticket.callSession || ticket.callSession.status !== 'ringing' || !String(req.body.answer || '').trim()) return res.status(409).json({ error: 'This call is no longer ringing.' });
    if (String(ticket.callSession.initiatedBy) === String(req.user._id)) return res.status(400).json({ error: 'Caller cannot answer their own call.' });
    ticket.callSession.answer = String(req.body.answer); ticket.callSession.status = 'active'; ticket.callSession.answeredAt = new Date();
  } else if (action === 'reject' || action === 'end') {
    if (!ticket.callSession) return res.status(409).json({ error: 'No call is active.' });
    ticket.callSession.status = action === 'reject' ? 'rejected' : 'ended'; ticket.callSession.endedAt = new Date();
  } else return res.status(400).json({ error: 'Invalid call action.' });
  await ticket.save();
  const saved = await InternalTicket.findById(ticket._id).populate('createdBy participants', 'name email role avatarUrl').lean();
  res.json({ ok: true, ticket: saved });
};

exports.create = async (req, res) => {
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  const attachments = cleanAttachments(req.body.attachments);
  if (!subject) return res.status(400).json({ error: 'Ticket subject is required.' });
  if (!message && !attachments.length) return res.status(400).json({ error: 'Add a message or attachment.' });
  const participantIds = [...new Set((Array.isArray(req.body.participants) ? req.body.participants : []).filter(mongoose.Types.ObjectId.isValid).map(String))];
  if (!participantIds.length) return res.status(400).json({ error: 'Select at least one participant for this private conversation.' });
  const ticket = await InternalTicket.create({ ticketNumber: await nextNumber(), subject,
    priority: PRIORITIES.includes(req.body.priority) ? req.body.priority : 'Medium', createdBy: req.user._id,
    participants: participantIds, messages: [{ message, author: req.user._id, authorName: req.user.name || req.user.email, authorRole: req.user.role, attachments }]
  });
  const saved = await InternalTicket.findById(ticket._id).populate('createdBy participants', 'name email role avatarUrl').lean();
  res.status(201).json({ ok: true, ticket: saved });
};

exports.update = async (req, res) => {
  const ticket = await InternalTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Internal ticket not found.' });
  if (!canAccess(ticket, req.user)) return res.status(403).json({ error: 'You cannot access this internal ticket.' });
  const message = String(req.body.message || '').trim();
  const attachments = cleanAttachments(req.body.attachments);
  if (message || attachments.length) ticket.messages.push({ message, author: req.user._id, authorName: req.user.name || req.user.email, authorRole: req.user.role, attachments });
  if (req.body.status) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid ticket status.' });
    ticket.status = req.body.status;
  }
  if (!message && !attachments.length && !req.body.status) return res.status(400).json({ error: 'Add a message, attachment, or status update.' });
  ticket.lastMessageAt = new Date();
  await ticket.save();
  const saved = await InternalTicket.findById(ticket._id).populate('createdBy participants', 'name email role avatarUrl').lean();
  res.json({ ok: true, ticket: saved });
};

module.exports.__test = { cleanAttachments, canAccess };
