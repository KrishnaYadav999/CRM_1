const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const PendingApproval = require('../models/PendingApproval');
const User = require('../models/User');
const { ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');
const { sendMail } = require('../utils/mailer');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let started = false;
let running = false;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function leadId(lead = {}) {
  return String(lead._id || lead.id || lead.sourceLeadId || lead.leadCode || '').trim();
}

function listFrom(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.leads || payload?.data?.leads || payload?.data || payload?.items || [];
}

async function getCcpLeads() {
  const response = await fetch(ccpApiUrl('ccp/leads'), { headers: ccpHeaders() });
  if (!response.ok) throw new Error(`CCP lead reminder read returned ${response.status}`);
  return listFrom(await response.json());
}

async function admins(roles = ['superadmin']) {
  return User.find({ role: { $in: roles }, isActive: { $ne: false } }).select('_id name email').lean();
}

async function resolveManager(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  const options = [{ crmUserId: id }, { ccpUserId: id }];
  if (mongoose.isValidObjectId(id)) options.unshift({ _id: id });
  return User.findOne({ $or: options, role: 'manager', isActive: { $ne: false } }).select('_id name email').lean();
}

async function resolveLeadUser(lead) {
  const assignment = [...(Array.isArray(lead.assignments) ? lead.assignments : [])].reverse().find((row) => row?.assignedStaff || row?.assignedTo) || lead;
  const id = String(assignment.assignedStaff || assignment.assignedTo || lead.createdByCrmUserId || '').trim();
  const email = String(assignment.assignedStaffEmail || assignment.assignedToEmail || lead.createdByEmail || '').trim().toLowerCase();
  const options = [];
  if (id) {
    options.push({ crmUserId: id }, { ccpUserId: id });
    if (mongoose.isValidObjectId(id)) options.unshift({ _id: id });
  }
  if (email) options.push({ email });
  return options.length ? User.findOne({ $or: options, isActive: { $ne: false } }).select('_id name email').lean() : null;
}

async function updateCcpLead(id, body) {
  const response = await fetch(ccpApiUrl(`ccp/leads/${encodeURIComponent(id)}`), { method: 'PUT', headers: ccpHeaders({ json: true }), body: JSON.stringify(body) });
  return response.ok;
}

async function remindFollowUps(leads, now) {
  for (const lead of leads) {
    if (lead.closedBy || lead.closedByText || !lead.nextFollowUpDate) continue;
    const due = new Date(`${lead.nextFollowUpDate}T${lead.nextFollowUpTime || '09:00'}:00`);
    if (!due.getTime()) continue;
    const delta = now - due.getTime();
    let stage = '';
    if (delta >= DAY) stage = 'RED_FLAG_24H';
    else if (delta >= 30 * 60 * 1000) stage = 'OVERDUE_30M';
    else if (delta >= -30 * 60 * 1000) stage = 'DUE_IN_30M';
    if (!stage) continue;
    const key = `${leadId(lead)}:${lead.nextFollowUpDate}:${lead.nextFollowUpTime || ''}:${stage}`;
    if (await Notification.exists({ kind: 'lead_followup_escalation', 'metadata.key': key })) continue;
    const recipient = await resolveLeadUser(lead);
    if (!recipient) continue;
    const labels = { DUE_IN_30M: 'is due within 30 minutes', OVERDUE_30M: 'is overdue by at least 30 minutes', RED_FLAG_24H: 'is overdue by 24 hours and has been red-flagged' };
    const company = lead.company || 'Lead';
    const description = `${company} follow-up ${labels[stage]}. The lead is still not closed.`;
    const item = await Notification.create({ title: stage === 'RED_FLAG_24H' ? 'RED FLAG: Lead follow-up overdue' : 'Lead follow-up reminder', description, tag: stage === 'RED_FLAG_24H' ? 'Red Flag' : 'Follow-Up', kind: 'lead_followup_escalation', audience: [recipient._id], metadata: { key, stage, leadId: leadId(lead), dueAt: due.toISOString(), priority: lead.followUpPriority || 'Medium' } });
    item.crmNotificationId = String(item._id); await item.save();
    if (recipient.email) await sendMail(recipient.email, `${stage === 'RED_FLAG_24H' ? 'RED FLAG' : 'Follow-Up Reminder'} - ${company}`, `<div style="font-family:Arial,sans-serif;color:#334155"><h2 style="color:${stage === 'RED_FLAG_24H' ? '#dc2626' : '#0f766e'}">${stage === 'RED_FLAG_24H' ? 'Lead Follow-Up Red Flag' : 'Lead Follow-Up Reminder'}</h2><p>${escapeHtml(description)}</p><p><strong>Scheduled:</strong> ${escapeHtml(lead.nextFollowUpDate)} ${escapeHtml(lead.nextFollowUpTime || '')}</p><p><strong>Priority:</strong> ${escapeHtml(lead.followUpPriority || 'Medium')}</p><p>Please update or close the lead in CRM.</p></div>`, { branded: false }).catch(() => null);
    if (stage === 'RED_FLAG_24H') await updateCcpLead(leadId(lead), { followUpFlag: 'RED' }).catch(() => false);
  }
}

async function remindManagers(leads, now) {
  for (const lead of leads) {
    const assignment = [...(Array.isArray(lead.assignments) ? lead.assignments : [])].reverse().find((row) => row?.assignedTo) || lead;
    if (!assignment.assignedTo || assignment.assignedStaff || lead.assignedStaff) continue;
    const assignedAt = new Date(lead.updatedAt || lead.importedUpdatedAt || lead.createdAt || lead.importedCreatedAt || 0);
    if (!assignedAt.getTime() || now - assignedAt < DAY) continue;
    const manager = await resolveManager(assignment.assignedTo);
    if (!manager) continue;
    const key = `${leadId(lead)}:${manager._id}`;
    if (await Notification.exists({ kind: 'lead_staff_assignment_24h_reminder', 'metadata.key': key })) continue;
    const company = lead.company || 'Company';
    const description = `${company} has been assigned to you for more than 24 hours and is still not assigned to staff. Please take action.`;
    const item = await Notification.create({ title: 'Staff assignment overdue', description, tag: 'Lead Reminder', kind: 'lead_staff_assignment_24h_reminder', audience: [manager._id], metadata: { key, leadId: leadId(lead), company } });
    item.crmNotificationId = String(item._id); await item.save();
    if (manager.email) await sendMail(manager.email, `24-hour Staff Assignment Reminder - ${company}`, `<div style="font-family:Arial,sans-serif;color:#334155"><h2 style="color:#0f766e">Staff assignment is pending</h2><p>${escapeHtml(description)}</p><p><strong>Assigned Manager:</strong> ${escapeHtml(manager.name || manager.email)}</p><p>Please open CRM and assign this lead to the appropriate staff member.</p></div>`, { branded: false }).catch(() => null);
  }
}

async function remindApprovals(now) {
  const cutoff = new Date(now - (2 * DAY));
  const approvals = await PendingApproval.find({ type: { $in: ['lead_duplicate', 'lead_royalty'] }, approvalStatus: 'PENDING', createdAt: { $lte: cutoff }, reminderCount: 0 }).limit(100);
  if (!approvals.length) return;
  const recipients = await admins(['superadmin']);
  for (const approval of approvals) {
    const kind = approval.type === 'lead_royalty' ? 'Royalty claim' : 'Special approval';
    const description = `${kind} for ${approval.clientName || 'a lead'} has been pending for more than 48 hours. Please approve or reject it.`;
    const item = await Notification.create({ title: `${kind} pending for 48 hours`, description, tag: 'Approval Reminder', kind: 'lead_approval_48h_reminder', audience: recipients.map((user) => user._id), visibleToRoles: ['superadmin'], metadata: { approvalId: String(approval._id), type: approval.type } });
    item.crmNotificationId = String(item._id); await item.save();
    await Promise.allSettled(recipients.filter((user) => user.email).map((user) => sendMail(user.email, `48-hour ${kind} Reminder - ${approval.clientName}`, `<div style="font-family:Arial,sans-serif;color:#334155"><h2 style="color:#0f766e">${escapeHtml(kind)} requires action</h2><p>${escapeHtml(description)}</p><p><strong>Requested by:</strong> ${escapeHtml(approval.createdByName || '-')}</p><p>Please review it in Pending Approval.</p></div>`, { branded: false })));
    approval.reminderCount = 1; approval.lastReminderAt = new Date(); await approval.save();
  }
}

async function remindOldDrafts(leads, now) {
  const rows = leads.filter((lead) => {
    const created = new Date(lead.createdAt || lead.importedCreatedAt || lead.leadDate || 0);
    return created.getTime() && now - created.getTime() >= 30 * DAY && String(lead.workflowStatus || '').toLowerCase() === 'draft' && !lead.closedBy && !lead.closedByText;
  });
  if (!rows.length) return;
  const dayKey = new Date(now).toISOString().slice(0, 10);
  if (await Notification.exists({ kind: 'unclosed_leads_30d_digest', 'metadata.dayKey': dayKey })) return;
  const recipients = await admins(['superadmin']);
  const bodyRows = rows.map((lead, index) => `<tr><td style="padding:9px">${index + 1}</td><td style="padding:9px">${escapeHtml(lead.leadDate || lead.createdAt || '-')}</td><td style="padding:9px">${escapeHtml(lead.importedCreatedBy || '-')}</td><td style="padding:9px">${escapeHtml(lead.company || '-')}</td><td style="padding:9px">${escapeHtml(lead.servicesOffered || '-')}</td><td style="padding:9px">${escapeHtml(lead.firstAnnualReturnYearApplicable || '-')}</td></tr>`).join('');
  const description = `${rows.length} draft lead(s) have remained unclosed for at least 30 days.`;
  const item = await Notification.create({ title: '30-day unclosed lead digest', description, tag: 'Pending Leads', kind: 'unclosed_leads_30d_digest', audience: recipients.map((user) => user._id), visibleToRoles: ['superadmin'], metadata: { dayKey, count: rows.length, leadIds: rows.map(leadId) } });
  item.crmNotificationId = String(item._id); await item.save();
  const html = `<div style="font-family:Arial,sans-serif;color:#334155"><h2 style="color:#0f766e">Unclosed Leads — 30 Day Review</h2><p>${escapeHtml(description)}</p><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#ecfdf5"><th>Sr.</th><th>Lead Date</th><th>Generated By</th><th>Company</th><th>Services</th><th>FY Years</th></tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  await Promise.allSettled(recipients.filter((user) => user.email).map((user) => sendMail(user.email, `30-day Unclosed Leads (${rows.length})`, html, { branded: false })));
}

async function runLeadWorkflowReminders() {
  if (running) return { skipped: true };
  running = true;
  try {
    const now = Date.now();
    const leads = await getCcpLeads();
    await remindManagers(leads, now);
    await remindFollowUps(leads, now);
    await remindApprovals(now);
    await remindOldDrafts(leads, now);
    return { leads: leads.length };
  } finally { running = false; }
}

function startLeadWorkflowReminderScheduler() {
  if (started) return;
  started = true;
  setTimeout(() => runLeadWorkflowReminders().catch((error) => console.error('Lead workflow reminders failed', error)), 10000);
  setInterval(() => runLeadWorkflowReminders().catch((error) => console.error('Lead workflow reminders failed', error)), 5 * 60 * 1000);
}

module.exports = { runLeadWorkflowReminders, startLeadWorkflowReminderScheduler };
