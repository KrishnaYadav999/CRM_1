const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildClientApprovalDecisionEmail({ clientName = 'Client Master', status, remarks = '', reviewerName = 'Admin', recipientName = 'User' } = {}) {
  const approved = String(status || '').toUpperCase() === 'APPROVED';
  const decision = approved ? 'approved' : 'rejected';
  const color = approved ? '#047857' : '#dc2626';
  const background = approved ? '#ecfdf5' : '#fef2f2';
  const safeRemarks = String(remarks || '').trim();
  return {
    subject: `Client Master ${approved ? 'Approved' : 'Rejected'} - ${clientName}`,
    html: `<div style="background:#f1f5f9;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#334155">
      <div style="max-width:680px;margin:auto;overflow:hidden;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff">
        <div style="background:${color};padding:24px 28px;color:#ffffff"><div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:.85">AnantTattva CRM</div><h1 style="margin:8px 0 0;font-size:24px">Client Master ${approved ? 'Approved' : 'Rejected'}</h1></div>
        <div style="padding:26px 28px"><p style="margin:0 0 18px;font-size:15px;line-height:1.7">Hello <strong>${escapeHtml(recipientName)}</strong>,</p>
          <p style="font-size:15px;line-height:1.7">Your Client Master request for <strong>${escapeHtml(clientName)}</strong> has been <strong style="color:${color}">${decision}</strong>.</p>
          <div style="margin:20px 0;padding:16px;border:1px solid ${color}33;border-radius:12px;background:${background}"><p style="margin:0 0 8px"><strong>Decision:</strong> ${approved ? 'Approved' : 'Rejected'}</p><p style="margin:0"><strong>Reviewed by:</strong> ${escapeHtml(reviewerName)}</p>${safeRemarks ? `<p style="margin:8px 0 0"><strong>Remarks:</strong> ${escapeHtml(safeRemarks)}</p>` : ''}</div>
          <p style="font-size:14px;line-height:1.7">Please sign in to CRM and open Pending Approval or Client Master to review the updated status.</p>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.7">Thanks and regards,<br><strong>Team AnantTattva</strong></p>
        </div>
      </div>
    </div>`
  };
}

async function notifyClientApprovalDecision({ record = {}, client = {}, status, remarks = '', reviewer = {} } = {}) {
  const payload = record.payload || {};
  const creatorId = client.createdBy || payload.createdByUserId || payload.createdById;
  const creator = creatorId ? await User.findById(creatorId).select('name email').lean() : null;
  const email = String(creator?.email || payload.createdByEmail || payload.userEmail || '').trim().toLowerCase();
  if (!email) return { sent: false, reason: 'requester_email_missing' };
  const clientName = record.clientName || payload.clientName || payload.companyName || client.data?.basic?.clientLegalName || client.data?.basic?.tradeName || 'Client Master';
  const content = buildClientApprovalDecisionEmail({
    clientName,
    status,
    remarks,
    reviewerName: reviewer.name || reviewer.email || 'Admin',
    recipientName: creator?.name || record.createdByName || payload.createdBy || payload.userName || 'User'
  });
  await sendMail(email, content.subject, content.html, { branded: false });
  return { sent: true, email };
}

module.exports = { buildClientApprovalDecisionEmail, notifyClientApprovalDecision };
