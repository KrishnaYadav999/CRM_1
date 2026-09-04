const PendingApproval = require('../models/PendingApproval');
const Client = require('../models/Client');
const { sendMail } = require('../utils/mailer');
const { resolveClientManager } = require('./clientApprovalDecisionNotifications');

const HOUR_MS = 60 * 60 * 1000;
const SCAN_MS = Math.max(60 * 1000, Number(process.env.COMPLIANCE_CORRECTION_SCAN_MS) || HOUR_MS);
let started = false;
let running = false;

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function appUrl() {
  return String(process.env.APP_URL || process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'https://crmananttattva.vercel.app').replace(/\/$/, '');
}

function correctionEmail(record, stage) {
  const breached = stage === 'BREACHED';
  const clientName = escapeHtml(record.clientName || 'Client Master');
  const recipient = escapeHtml(record.correctionRecipientName || 'Manager');
  const decision = record.correctionDecision === 'REJECTED' ? 'Rejected' : 'Partially Approved';
  const dueAt = record.correctionDueAt ? new Date(record.correctionDueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
  const color = breached ? '#b91c1c' : '#d97706';
  const title = breached ? 'Permanent Red Flag Applied' : '24-Hour Correction Reminder';
  return {
    subject: `${title} - ${record.clientName || 'Client Master'}`,
    html: `<div style="background:#f1f5f9;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#334155"><div style="max-width:680px;margin:auto;overflow:hidden;border:1px solid #e2e8f0;border-radius:18px;background:#fff"><div style="background:${color};padding:25px 28px;color:#fff"><div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">AnantTattva CRM</div><h1 style="margin:8px 0 0;font-size:24px">${title}</h1></div><div style="padding:26px 28px"><p>Hello <strong>${recipient}</strong>,</p><p>The compliance decision for <strong>${clientName}</strong> is <strong>${decision}</strong>.</p>${breached ? '<div style="padding:15px;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;color:#991b1b"><strong>The 48-hour correction deadline has expired.</strong> This Client Master now has a permanent red flag in CRM.</div>' : `<div style="padding:15px;border:1px solid #fde68a;border-radius:12px;background:#fffbeb;color:#92400e"><strong>24 hours remaining.</strong> Complete the requested data and obtain compliance approval before <strong>${escapeHtml(dueAt)}</strong> to avoid a permanent red flag.</div>`}<p style="margin-top:22px"><a href="${escapeHtml(appUrl())}/client-master" style="display:inline-block;border-radius:10px;background:#075848;padding:13px 20px;color:#fff;text-decoration:none;font-weight:800">Open Client Master</a></p><p style="margin-top:22px;color:#64748b;font-size:12px">Automated compliance correction notification. No reply required.</p></div></div></div>`
  };
}

async function ensureRecipient(record) {
  if (record.correctionRecipientEmail) return record;
  const client = await Client.findById(record.sourceClientId).lean();
  if (!client) return record;
  const manager = await resolveClientManager(client, record.payload || {});
  if (!manager?.email) return record;
  record.correctionRecipientId = manager._id;
  record.correctionRecipientEmail = String(manager.email).trim().toLowerCase();
  record.correctionRecipientName = manager.name || '';
  await record.save();
  return record;
}

async function sendCorrectionEmail(record, stage) {
  await ensureRecipient(record);
  if (!record.correctionRecipientEmail) throw new Error('Client Master manager email is missing');
  const content = correctionEmail(record, stage);
  await sendMail(record.correctionRecipientEmail, content.subject, content.html, { branded: false });
}

async function runClientComplianceCorrectionReminders(now = new Date()) {
  if (running) return { skipped: 'already_running' };
  running = true;
  const result = { reminders: 0, breached: 0, errors: 0 };
  try {
    const dueReminders = await PendingApproval.find({
      type: 'client', correctionStatus: 'OPEN', correctionReminderSentAt: null,
      correctionReminderAt: { $lte: now }, correctionDueAt: { $gt: now }
    }).limit(100);
    for (const record of dueReminders) {
      const claimed = await PendingApproval.findOneAndUpdate(
        { _id: record._id, correctionStatus: 'OPEN', correctionReminderSentAt: null, correctionReminderAt: { $lte: now }, correctionDueAt: { $gt: now } },
        { $set: { correctionReminderSentAt: now } },
        { new: true }
      );
      if (!claimed) continue;
      try {
        await sendCorrectionEmail(claimed, 'REMINDER');
        claimed.correctionEmailError = '';
        await claimed.save();
        result.reminders += 1;
      } catch (error) {
        claimed.correctionReminderSentAt = null;
        claimed.correctionEmailError = error.message || 'Unable to send 24-hour correction reminder';
        claimed.correctionReminderAt = new Date(now.getTime() + HOUR_MS);
        await claimed.save();
        result.errors += 1;
      }
    }

    const breaches = await PendingApproval.find({ type: 'client', correctionStatus: 'OPEN', correctionDueAt: { $lte: now } }).limit(100);
    for (const record of breaches) {
      const claimed = await PendingApproval.findOneAndUpdate(
        { _id: record._id, correctionStatus: 'OPEN', correctionDueAt: { $lte: now } },
        { $set: { correctionStatus: 'BREACHED', correctionBreachedAt: now, reminderFlag: 'PERMANENT_RED', redFlagAt: now } },
        { new: true }
      );
      if (!claimed) continue;
      try {
        await sendCorrectionEmail(claimed, 'BREACHED');
        claimed.correctionEmailError = '';
      } catch (error) {
        claimed.correctionEmailError = error.message || 'Unable to send permanent red-flag email';
        result.errors += 1;
      }
      await claimed.save();
      result.breached += 1;
    }
    return result;
  } finally {
    running = false;
  }
}

function startClientComplianceCorrectionReminderScheduler() {
  if (started) return;
  started = true;
  const run = () => runClientComplianceCorrectionReminders().catch((error) => console.error('Compliance correction reminder scan failed', error));
  setTimeout(run, 15000);
  setInterval(run, SCAN_MS);
}

module.exports = { correctionEmail, runClientComplianceCorrectionReminders, startClientComplianceCorrectionReminderScheduler };
