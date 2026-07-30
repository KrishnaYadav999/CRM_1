const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function eventLabel(event) {
  return {
    created: 'Generated — Pending Approval',
    revised: 'Revised — Re-approval Required',
    approved: 'Approved',
    rejected: 'Rejected'
  }[event] || 'Updated';
}

function quotationLifecycleEmailContent({ quotation = {}, event, actor = {} }) {
  const label = eventLabel(event);
  const quotationNumber = String(quotation.quotationNumber || 'Quotation').trim();
  const company = String(quotation.companyName || quotation.leadDetails?.companyName || 'Client').trim();
  const actorName = String(actor.name || actor.email || 'CRM User').trim();
  const decision = event === 'approved' || event === 'rejected';
  const subject = `${quotationNumber} - ${label}`;
  const intro = decision
    ? `${quotationNumber} for ${company} has been ${event}.`
    : event === 'revised'
      ? `${quotationNumber} for ${company} was revised and requires approval again.`
      : `${quotationNumber} for ${company} was generated and is waiting for approval.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#334155">
    <h2 style="color:#0f766e">Quotation ${escapeHtml(label)}</h2>
    <p>${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">
      <tr><td style="padding:10px;background:#ecfdf5;font-weight:700">Quotation</td><td style="padding:10px">${escapeHtml(quotationNumber)}</td></tr>
      <tr><td style="padding:10px;background:#ecfdf5;font-weight:700">Company</td><td style="padding:10px">${escapeHtml(company)}</td></tr>
      <tr><td style="padding:10px;background:#ecfdf5;font-weight:700">Status</td><td style="padding:10px">${escapeHtml(label)}</td></tr>
      <tr><td style="padding:10px;background:#ecfdf5;font-weight:700">Action By</td><td style="padding:10px">${escapeHtml(actorName)}</td></tr>
    </table>
    <p style="margin-top:16px">Open CRM Pending Approval to review the latest quotation details.</p>
  </div>`;
  return { subject, html };
}

async function resolveRecipients(quotation = {}, actor = {}) {
  const admins = await User.find({
    role: { $in: ['admin', 'superadmin'] },
    isActive: { $ne: false },
    email: { $ne: '' }
  }).select('_id name email').lean();

  let creator = quotation.createdBy && typeof quotation.createdBy === 'object'
    ? quotation.createdBy
    : null;
  if (!creator?.email && quotation.createdBy) {
    creator = await User.findById(quotation.createdBy).select('_id name email').lean();
  }
  if (!creator?.email && quotation.createdByName) {
    creator = await User.findOne({
      $or: [
        { email: String(quotation.createdByName).trim().toLowerCase() },
        { name: String(quotation.createdByName).trim() }
      ],
      isActive: { $ne: false }
    }).select('_id name email').lean();
  }

  const recipients = [...admins, creator, actor]
    .filter((user) => user?.email)
    .map((user) => ({ name: user.name || user.email, email: String(user.email).trim().toLowerCase() }));
  return [...new Map(recipients.map((user) => [user.email, user])).values()];
}

async function sendQuotationLifecycleEmail({ quotation, event, actor }) {
  const recipients = await resolveRecipients(quotation, actor);
  const content = quotationLifecycleEmailContent({ quotation, event, actor });
  const results = await Promise.allSettled(recipients.map((recipient) =>
    sendMail(recipient.email, content.subject, content.html, { branded: false })
  ));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) {
    console.error('[Quotation lifecycle email] delivery failures', {
      event,
      quotationId: String(quotation?._id || ''),
      failed: failed.length,
      total: recipients.length
    });
  }
  return { recipients: recipients.length, sent: results.length - failed.length, failed: failed.length };
}

module.exports = {
  eventLabel,
  quotationLifecycleEmailContent,
  resolveRecipients,
  sendQuotationLifecycleEmail
};
