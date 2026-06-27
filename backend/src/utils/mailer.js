const nodemailer = require('nodemailer');

function normalizeRecipients(to) {
  if (Array.isArray(to)) return to;
  return String(to || '')
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function readMailUser() {
  return process.env.SMTP_USER || process.env.MAIL_USER || process.env.EMAIL_USER || process.env.GMAIL_USER;
}

function readMailPass() {
  const mailPass = process.env.SMTP_PASS || process.env.MAIL_PASS || process.env.EMAIL_PASS || process.env.GMAIL_PASS;
  if (!mailPass) return mailPass;

  // Gmail app passwords are displayed in groups with spaces; SMTP auth expects the 16-character value.
  return process.env.MAIL_PASS_STRIP_SPACES === 'false'
    ? mailPass
    : String(mailPass).replace(/\s+/g, '');
}

function readMailFromName() {
  return String(process.env.MAIL_FROM_NAME || process.env.APP_NAME || 'CRM').trim() || 'CRM';
}

function quoteDisplayName(name) {
  return `"${String(name || 'CRM').replace(/["\\]/g, '')}"`;
}

function formatFromAddress() {
  const mailUser = readMailUser();
  const configuredFrom = String(process.env.MAIL_FROM || '').trim();
  const displayName = readMailFromName();

  if (configuredFrom) {
    const bracketMatch = configuredFrom.match(/<([^>]+)>/);
    if (bracketMatch) return `${quoteDisplayName(displayName)} <${bracketMatch[1].trim()}>`;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredFrom)) return `${quoteDisplayName(displayName)} <${configuredFrom}>`;
    return configuredFrom;
  }

  return mailUser ? `${quoteDisplayName(displayName)} <${mailUser}>` : undefined;
}

function createTransporter() {
  const mailUser = readMailUser();
  const mailPass = readMailPass();

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: mailUser && mailPass ? { user: mailUser, pass: mailPass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

function summarizeMailInfo(info) {
  return {
    messageId: info?.messageId,
    accepted: info?.accepted || [],
    rejected: info?.rejected || [],
    pending: info?.pending || [],
    response: info?.response,
    envelope: info?.envelope
  };
}

function getMailDebugConfig() {
  const mailUser = readMailUser();
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    hasUser: Boolean(mailUser),
    userDomain: String(mailUser || '').split('@')[1] || '',
    hasPassword: Boolean(readMailPass()),
    from: formatFromAddress() || '',
    replyTo: process.env.MAIL_REPLY_TO || mailUser || ''
  };
}

async function sendMail(to, subject, html) {
  const mailUser = readMailUser();
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is not configured');
  const recipients = normalizeRecipients(to);
  if (!recipients.length) throw new Error('Email recipient is required');

  const from = formatFromAddress();
  const replyTo = process.env.MAIL_REPLY_TO || mailUser || undefined;
  const transporter = createTransporter();
  const info = await transporter.sendMail({ from, to: recipients, replyTo, subject, html });
  return { raw: info, summary: summarizeMailInfo(info) };
}

module.exports = { sendMail, getMailDebugConfig, summarizeMailInfo };
