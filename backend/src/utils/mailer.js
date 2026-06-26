const nodemailer = require('nodemailer');

function normalizeRecipients(to) {
  if (Array.isArray(to)) return to;
  return String(to || '')
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function createTransporter() {
  const mailUser = process.env.SMTP_USER || process.env.MAIL_USER;
  const mailPass = process.env.SMTP_PASS || process.env.MAIL_PASS;

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
  const mailUser = process.env.SMTP_USER || process.env.MAIL_USER;
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
