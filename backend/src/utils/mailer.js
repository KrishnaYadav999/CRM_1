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

async function sendMail(to, subject, html) {
  const mailUser = readMailUser();
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is not configured');
  const recipients = normalizeRecipients(to);
  if (!recipients.length) throw new Error('Email recipient is required');

  const from = process.env.MAIL_FROM || mailUser;
  const replyTo = process.env.MAIL_REPLY_TO || mailUser || undefined;
  const transporter = createTransporter();
  const info = await transporter.sendMail({ from, to: recipients, replyTo, subject, html });
  return info;
}

module.exports = { sendMail };
