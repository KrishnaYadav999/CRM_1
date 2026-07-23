const ClientOnboardingReminder = require('../models/ClientOnboardingReminder');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKLIST = [
  ['basic.clientLegalName', 'Client Legal Name'], ['basic.tradeName', 'Trade Name'], ['basic.piboCategory', 'PIBO Category'],
  ['basic.eprCategory', 'EPR Category'], ['basic.onboardingYear', 'Onboarding Year'], ['registeredAddress.state', 'Registered State'],
  ['registeredAddress.city', 'Registered City'], ['registeredAddress.pincode', 'Registered PIN'], ['compliance.gstNumber', 'GST Number'],
  ['cpcb.loginId', 'CPCB Login ID'], ['cpcb.loginPassword', 'CPCB Password'], ['otp.mobile', 'OTP Mobile'],
  ['otp.personName', 'OTP Person'], ['authorised.name', 'Authorized Person'], ['authorised.mobile', 'Authorized Person Mobile']
];

function readPath(source, path) { return path.split('.').reduce((value, key) => value?.[key], source); }
function filled(value) { return value !== undefined && value !== null && String(value).trim() !== ''; }
function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

function completeness(data = {}) {
  const filledFields = []; const missingFields = [];
  CHECKLIST.forEach(([path, label]) => (filled(readPath(data, path)) ? filledFields : missingFields).push(label));
  return { filledFields, missingFields, filledCount: filledFields.length, totalCount: CHECKLIST.length, completed: missingFields.length === 0 };
}

function hasBasicInfo(data = {}) {
  return Object.values(data.basic || {}).some(filled);
}

async function trackManualClientSave({ payload, ccpPayload, user }) {
  if (!hasBasicInfo(payload.data) || !payload.selectedLead || !user?._id) return null;
  const client = ccpPayload?.client || ccpPayload?.data?.client || ccpPayload?.data || ccpPayload;
  const ccpClientId = String(client?._id || client?.id || client?.ccpClientId || payload.data?.importMeta?.ccpClientId || '').trim();
  if (!ccpClientId) return null;
  const owner = await User.findById(user._id).select('managerId').lean();
  const status = completeness(payload.data);
  return ClientOnboardingReminder.findOneAndUpdate(
    { ccpClientId },
    {
      $set: {
        uniqueId: payload.data?.importMeta?.uniqueId || client?.data?.importMeta?.uniqueId || '',
        clientName: payload.data?.basic?.clientLegalName || payload.data?.basic?.tradeName || 'Client',
        ownerId: user._id, managerId: owner?.managerId || undefined, lastSavedAt: new Date(), ...status
      },
      $setOnInsert: { firstBasicInfoAt: new Date(), source: 'manual-lead-conversion' },
      ...(status.completed ? { $unset: { remindedAt: 1 } } : {})
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function buildCsv(rows) {
  const header = ['Unique ID', 'Client', 'Filled', 'Total', 'Completion %', 'Missing Fields', 'Started At', 'Last Saved At'];
  return [header, ...rows.map((row) => [row.uniqueId, row.clientName, row.filledCount, row.totalCount, Math.round((row.filledCount / Math.max(1, row.totalCount)) * 100), row.missingFields.join('; '), row.firstBasicInfoAt?.toISOString(), row.lastSavedAt?.toISOString()])]
    .map((line) => line.map(csvCell).join(',')).join('\n');
}

async function notifyRecipient(recipient, rows, audienceLabel) {
  if (!recipient || !rows.length) return;
  const summary = rows.map((row) => `${row.clientName}: ${row.filledCount}/${row.totalCount} fields complete`).join('; ');
  await Notification.create({
    title: `Client Master incomplete for 7 days (${rows.length})`, description: summary, tag: 'Client Master', kind: 'client_onboarding_reminder',
    createdByName: 'CRM Reminder', audience: [recipient._id], visibleToRoles: [], metadata: { clientIds: rows.map((row) => row.ccpClientId), audienceLabel, count: rows.length }
  });
  if (recipient.email) {
    const csv = buildCsv(rows);
    await sendMail(recipient.email, `Client Master 7-day completion reminder (${rows.length})`, `<p>${rows.length} manual Client Master record(s) remain incomplete after seven days.</p><p>${summary}</p><p>The attached CSV contains the complete pending-field report.</p>`, { attachments: [{ filename: 'client-master-incomplete.csv', content: Buffer.from(csv), contentType: 'text/csv' }] });
  }
}

async function runClientOnboardingReminders(now = new Date()) {
  const due = await ClientOnboardingReminder.find({ completed: false, remindedAt: { $exists: false }, firstBasicInfoAt: { $lte: new Date(now.getTime() - 7 * DAY_MS) } }).lean();
  if (!due.length) return { processed: 0 };
  const ownerIds = [...new Set(due.map((row) => String(row.ownerId)))];
  const users = await User.find({ _id: { $in: ownerIds } }).select('name email managerId role').lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const managerIds = [...new Set(users.map((user) => String(user.managerId || '')).filter(Boolean))];
  const managers = await User.find({ $or: [{ _id: { $in: managerIds } }, { role: { $in: ['manager', 'admin', 'superadmin'] }, isActive: true }] }).select('name email role').lean();
  const managerMap = new Map(managers.map((user) => [String(user._id), user]));
  const managerBuckets = new Map();
  for (const ownerId of ownerIds) {
    const rows = due.filter((row) => String(row.ownerId) === ownerId);
    const owner = userMap.get(ownerId); await notifyRecipient(owner, rows, 'owner');
    const directManager = managerMap.get(String(owner?.managerId || ''));
    const recipients = directManager ? [directManager] : managers.filter((user) => ['manager', 'admin', 'superadmin'].includes(user.role));
    recipients.forEach((manager) => managerBuckets.set(String(manager._id), { manager, rows: [...(managerBuckets.get(String(manager._id))?.rows || []), ...rows] }));
  }
  for (const { manager, rows } of managerBuckets.values()) await notifyRecipient(manager, rows, 'manager');
  await ClientOnboardingReminder.updateMany({ _id: { $in: due.map((row) => row._id) } }, { $set: { remindedAt: now } });
  return { processed: due.length };
}

let started = false;
function startClientOnboardingReminderScheduler() {
  if (started || process.env.CLIENT_ONBOARDING_REMINDERS_ENABLED === 'false') return;
  started = true;
  const run = () => runClientOnboardingReminders().catch((error) => console.error('Client onboarding reminder failed', error));
  setTimeout(run, 5000); setInterval(run, 60 * 60 * 1000);
}

module.exports = { CHECKLIST, completeness, hasBasicInfo, trackManualClientSave, buildCsv, runClientOnboardingReminders, startClientOnboardingReminderScheduler };
