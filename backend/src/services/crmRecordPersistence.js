const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Client = require('../models/Client');

function text(value) {
  return String(value || '').trim();
}

function normalizeCompanyIdentity(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bPRIVATE\s+LIMITED\b/g, ' PVT LTD ')
    .replace(/\bLIMITED\b/g, ' LTD ')
    .replace(/\bCORPORATION\b/g, ' CORP ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recordFromPayload(payload = {}, keys = []) {
  for (const candidate of [
    ...keys.map((key) => payload?.[key]),
    ...keys.map((key) => payload?.data?.[key]),
    payload?.data,
    payload
  ]) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  }
  return {};
}

function externalId(record = {}, fallback = '') {
  return text(record._id || record.id || record.sourceLeadId || record.ccpLeadId || record.ccpClientId || record.uniqueId || fallback);
}

function validUserId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? value : undefined;
}

async function resolveLocalLead(identity) {
  const value = text(identity);
  if (!value) return null;
  const filters = [
    { ccpLeadId: value },
    { sourceLeadId: value },
    { externalLeadId: value },
    { leadCode: value }
  ];
  if (mongoose.Types.ObjectId.isValid(value)) filters.unshift({ _id: value });
  return Lead.findOne({ $or: filters }).select('_id ccpLeadId').lean();
}

async function persistCcpLead({ requestPayload = {}, responsePayload = {}, fallbackId = '', user }) {
  const saved = recordFromPayload(responsePayload, ['lead']);
  const ccpLeadId = externalId(saved, fallbackId || requestPayload.sourceLeadId || requestPayload.leadCode);
  if (!ccpLeadId) throw new Error('CCP response did not include a stable lead identity.');

  const combined = { ...requestPayload, ...saved };
  const company = text(combined.company || combined.companyName || combined.clientName);
  const primaryAddress = Array.isArray(combined.addresses) ? combined.addresses[0] || {} : {};
  const primaryContact = Array.isArray(combined.contacts) ? combined.contacts[0] || {} : {};
  const update = {
    ...combined,
    ...primaryAddress,
    ...primaryContact,
    ccpLeadId,
    sourceLeadId: text(combined.sourceLeadId || ccpLeadId),
    externalLeadId: text(combined.externalLeadId || ccpLeadId),
    company,
    companyIdentity: normalizeCompanyIdentity(company),
    createdBy: validUserId(combined.createdByCrmUserId || user?._id),
    workflowStatus: combined.workflowStatus === 'submitted' ? 'submitted' : 'draft',
    sync: { source: 'crm+ccp', status: 'synced', lastSyncedAt: new Date(), lastError: '' },
    ccpSnapshot: saved
  };
  delete update._id;
  delete update.id;
  for (const field of ['assignedTo', 'assignedStaff', 'closedBy', 'createdBy']) {
    if (!validUserId(update[field])) delete update[field];
  }
  if (!['PIBO', 'SIMP', 'PWP'].includes(update.piboParent)) delete update.piboParent;
  if (!['PIBO', 'SIMP', 'PWP'].includes(update.piboCategoryParent)) delete update.piboCategoryParent;
  if (update.pinCode && !/^\d{6}$/.test(text(update.pinCode))) delete update.pinCode;
  return Lead.findOneAndUpdate(
    { ccpLeadId },
    { $set: update },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function persistCcpClient({ requestPayload = {}, responsePayload = {}, fallbackId = '', user }) {
  const saved = recordFromPayload(responsePayload, ['client']);
  const importMeta = { ...(requestPayload.data?.importMeta || {}), ...(saved.data?.importMeta || {}) };
  const ccpClientId = externalId(saved, fallbackId || importMeta.ccpClientId || importMeta.uniqueId);
  if (!ccpClientId) throw new Error('CCP response did not include a stable client identity.');

  const data = { ...(requestPayload.data || {}), ...(saved.data || {}) };
  data.importMeta = { ...importMeta, ccpClientId };
  const selectedLeadIdentity = text(saved.selectedLead || requestPayload.selectedLead || importMeta.leadNumber);
  const localLead = await resolveLocalLead(selectedLeadIdentity);
  const company = text(data.basic?.clientLegalName || data.companyOverview?.companyName || importMeta.companyName);
  const update = {
    selectedLead: localLead?._id,
    selectedLeadCcpId: text(localLead?.ccpLeadId || selectedLeadIdentity),
    ccpClientId,
    companyIdentity: normalizeCompanyIdentity(company),
    adminControls: { ...(requestPayload.adminControls || {}), ...(saved.adminControls || {}) },
    data,
    workflowStatus: (saved.workflowStatus || requestPayload.workflowStatus) === 'submitted' ? 'submitted' : 'draft',
    createdBy: validUserId(requestPayload.createdByCrmUserId || user?._id),
    sync: { source: 'crm+ccp', status: 'synced', lastSyncedAt: new Date(), lastError: '' },
    ccpSnapshot: saved
  };
  if (!update.selectedLead) delete update.selectedLead;
  if (!update.createdBy) delete update.createdBy;
  return Client.findOneAndUpdate(
    { ccpClientId },
    { $set: update },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

module.exports = {
  normalizeCompanyIdentity,
  recordFromPayload,
  externalId,
  resolveLocalLead,
  persistCcpLead,
  persistCcpClient
};
