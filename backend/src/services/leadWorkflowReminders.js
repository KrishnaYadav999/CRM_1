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

function buildFollowUpReminderEmail({ company, description, date, time, priority, isRedFlag }) {
  const accent = isRedFlag ? '#dc2626' : '#0f766e';
  const accentSoft = isRedFlag ? '#fef2f2' : '#f0fdfa';
  const accentBorder = isRedFlag ? '#fecaca' : '#99f6e4';
  const title = isRedFlag ? 'Lead follow-up overdue' : 'Upcoming lead follow-up';
  const eyebrow = isRedFlag ? 'ACTION REQUIRED' : 'FOLLOW-UP REMINDER';
  const safeCompany = escapeHtml(company);
  const safeDescription = escapeHtml(description);
  const safeSchedule = `${escapeHtml(date)}${time ? ` &nbsp;&bull;&nbsp; ${escapeHtml(time)}` : ''}`;
  const safePriority = escapeHtml(priority || 'Medium');

  return `
    <div style="margin:0;padding:32px 16px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
              <tr>
                <td style="height:6px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:34px 36px 22px;">
                  <span style="display:inline-block;padding:6px 10px;border:1px solid ${accentBorder};border-radius:999px;background-color:${accentSoft};color:${accent};font-size:11px;font-weight:700;letter-spacing:1px;">${eyebrow}</span>
                  <h1 style="margin:18px 0 8px;color:#0f172a;font-size:28px;line-height:36px;font-weight:700;">${title}</h1>
                  <p style="margin:0;color:#64748b;font-size:15px;line-height:24px;">A quick reminder from your CRM workspace</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 36px 28px;">
                  <div style="padding:20px 22px;background-color:${accentSoft};border-left:4px solid ${accent};border-radius:8px;">
                    <p style="margin:0 0 6px;color:#64748b;font-size:12px;line-height:18px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">Lead</p>
                    <p style="margin:0 0 8px;color:#0f172a;font-size:20px;line-height:28px;font-weight:700;">${safeCompany}</p>
                    <p style="margin:0;color:#334155;font-size:15px;line-height:24px;">${safeDescription}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 36px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                    <tr>
                      <td style="padding:15px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:14px;line-height:22px;">Scheduled for</td>
                      <td align="right" style="padding:15px 0;border-top:1px solid #e2e8f0;color:#0f172a;font-size:14px;line-height:22px;font-weight:700;">${safeSchedule}</td>
                    </tr>
                    <tr>
                      <td style="padding:15px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:14px;line-height:22px;">Priority</td>
                      <td align="right" style="padding:15px 0;border-top:1px solid #e2e8f0;color:${accent};font-size:14px;line-height:22px;font-weight:700;">${safePriority}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 36px 34px;">
                  <p style="margin:0;padding:16px 18px;border-radius:8px;background-color:#f8fafc;color:#475569;font-size:14px;line-height:22px;text-align:center;">Please update the follow-up or close this lead in CRM.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 36px;background-color:#0f172a;color:#94a3b8;font-size:12px;line-height:18px;text-align:center;">
                  This is an automated CRM notification. No reply is required.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>`;
}

function leadId(lead = {}) {
  return String(lead._id || lead.id || lead.sourceLeadId || lead.leadCode || '').trim();
}

function listFrom(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.leads || payload?.data?.leads || payload?.data || payload?.items || [];
}

async function getCcpLeads() {
  try {
    const response = await fetch(ccpApiUrl('ccp/leads'), { headers: ccpHeaders() });
    if (!response.ok) throw new Error(`CCP lead reminder read returned ${response.status}`);
    return listFrom(await response.json());
  } catch (error) {
    console.warn('CCP lead reminder fetch failed, continuing with local reminders only', error.message);
    return [];
  }
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
  const creatorRow = (Array.isArray(lead.serviceSelections) ? lead.serviceSelections : []).find((row) => row?.createdByCrmUserId || row?.createdByEmail || row?.createdByName) || {};
  const id = String(assignment.assignedStaff || assignment.assignedTo || lead.createdByCrmUserId || creatorRow.createdByCrmUserId || '').trim();
  const email = String(assignment.assignedStaffEmail || assignment.assignedToEmail || lead.createdByEmail || creatorRow.createdByEmail || '').trim().toLowerCase();
  const name = String(creatorRow.createdByName || lead.createdByName || lead.importedCreatedBy || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const options = [];
  if (id) {
    options.push({ crmUserId: id }, { ccpUserId: id });
    if (mongoose.isValidObjectId(id)) options.unshift({ _id: id });
  }
  if (email) options.push({ email });
  if (name) options.push({ name });
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
    if (recipient.email) {
      const html = buildFollowUpReminderEmail({
        company,
        description,
        date: lead.nextFollowUpDate,
        time: lead.nextFollowUpTime || '',
        priority: lead.followUpPriority || 'Medium',
        isRedFlag: stage === 'RED_FLAG_24H',
      });
      await sendMail(recipient.email, `${stage === 'RED_FLAG_24H' ? 'RED FLAG' : 'Follow-Up Reminder'} - ${company}`, html, { branded: false }).catch(() => null);
    }
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
    const assignmentClosed = (Array.isArray(lead.assignments) ? lead.assignments : []).some((row) => row?.closedBy || row?.closedByText);
    return created.getTime() && now - created.getTime() >= 15 * 60 * 1000 && !lead.closedBy && !lead.closedByText && !assignmentClosed;
  });
  if (!rows.length) return;
  for (const lead of rows) {
    const superAdmins = await admins(['superadmin']);
    const recipient = await resolveLeadUser(lead) || superAdmins.find((user) => user.email);
    if (!recipient) continue;
    const key = `${leadId(lead)}:15m`;
    if (await Notification.exists({ kind: 'unclosed_lead_15m', 'metadata.key': key })) continue;
    const company = lead.company || 'Lead';
    const description = `${company} has remained unclosed for at least 15 minutes. Please review and close the lead or update its status.`;
    const audience = [...new Set([recipient._id, ...superAdmins.map((user) => user._id)].map(String))];
    const item = await Notification.create({ title: 'Lead pending for 15 minutes', description, tag: 'Pending Leads', kind: 'unclosed_lead_15m', audience, visibleToRoles: ['superadmin'], metadata: { key, leadId: leadId(lead), company } });
    item.crmNotificationId = String(item._id); await item.save();
    if (recipient.email) {
      const services = (Array.isArray(lead.serviceSelections) ? lead.serviceSelections : [lead])
        .map((row) => [row?.servicesOffered, row?.applicableService].filter(Boolean).join(' — '))
        .filter(Boolean).join(', ') || '-';
      const html = `<div style="margin:0;padding:30px 14px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;overflow:hidden;border:1px solid #dbe5e7;border-radius:16px;background:#fff">
            <tr><td style="height:7px;background:#0f766e"></td></tr>
            <tr><td style="padding:30px 34px 18px"><span style="display:inline-block;border-radius:99px;background:#fff7ed;padding:7px 11px;color:#c2410c;font-size:11px;font-weight:700;letter-spacing:.8px">ACTION REQUIRED</span><h1 style="margin:16px 0 8px;color:#0f766e;font-size:27px">Lead pending for 15 minutes</h1><p style="margin:0;color:#64748b;line-height:1.6">${escapeHtml(description)}</p></td></tr>
            <tr><td style="padding:0 34px 30px"><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
              <tr style="background:#f8fafc"><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0;font-weight:700">Company</td><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0">${escapeHtml(company)}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0;font-weight:700">Lead ID</td><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0">${escapeHtml(lead.leadCode || leadId(lead) || '-')}</td></tr>
              <tr style="background:#f8fafc"><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0;font-weight:700">Lead Date</td><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0">${escapeHtml(lead.createdAt || lead.importedCreatedAt || lead.leadDate || '-')}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0;font-weight:700">Generated By</td><td style="padding:13px 15px;border-bottom:1px solid #e2e8f0">${escapeHtml(lead.importedCreatedBy || lead.createdByName || lead.createdByEmail || '-')}</td></tr>
              <tr style="background:#f8fafc"><td style="padding:13px 15px;font-weight:700">Services</td><td style="padding:13px 15px">${escapeHtml(services)}</td></tr>
            </table><p style="margin:22px 0 0;text-align:center;color:#64748b;font-size:13px">Please open CRM and close the lead or update its status.</p></td></tr>
          </table>
        </td></tr></table></div>`;
      const cc = [...new Set(superAdmins.map((user) => String(user.email || '').trim().toLowerCase()).filter((email) => email && email !== recipient.email.toLowerCase()))];
      await sendMail(recipient.email, `Pending Lead Reminder - ${company}`, html, { branded: false, cc })
        .catch((error) => console.error(`Pending lead email failed for ${recipient.email}`, error));
    }
  }
  return;
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
  // Check every minute so the 15-minute pending reminder is not delayed by an
  // additional five-minute scheduler window.
  setInterval(() => runLeadWorkflowReminders().catch((error) => console.error('Lead workflow reminders failed', error)), 60 * 1000);
}

module.exports = {
  runLeadWorkflowReminders,
  startLeadWorkflowReminderScheduler,
  __test: { getCcpLeads }
};
