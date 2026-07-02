const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { getVisibleUserScope } = require('../utils/visibilityScope');

const router = express.Router();

const DEFAULT_CCP_API_BASE_URL = 'https://ccp-henna.vercel.app/api/ccp';
const DEFAULT_CCP_DB_NAME = 'ccp';
const CCP_FULL_ACCESS_ROLES = ROLES;

function ccpBaseUrls() {
  return [
    process.env.CCP_API_BASE_URL,
    DEFAULT_CCP_API_BASE_URL
  ]
    .map((url) => String(url || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function normalizeCollection(payload, key) {
  if (Array.isArray(payload)) return { ok: true, [key]: payload };
  if (Array.isArray(payload?.[key])) return { ...payload, ok: payload.ok !== false };
  if (Array.isArray(payload?.data)) return { ok: true, [key]: payload.data };
  if (Array.isArray(payload?.data?.[key])) return { ...payload, ok: payload.ok !== false, [key]: payload.data[key] };
  if (Array.isArray(payload?.result?.[key])) return { ...payload, ok: payload.ok !== false, [key]: payload.result[key] };
  if (Array.isArray(payload?.items)) return { ...payload, ok: payload.ok !== false, [key]: payload.items };
  if (Array.isArray(payload?.rows)) return { ...payload, ok: payload.ok !== false, [key]: payload.rows };
  return { ok: payload?.ok !== false, [key]: [] };
}

function ccpDbName() {
  return String(process.env.CCP_DB_NAME || DEFAULT_CCP_DB_NAME).trim() || DEFAULT_CCP_DB_NAME;
}

async function fetchCcpRowsFromMongo(path, key) {
  const db = mongoose.connection.useDb(ccpDbName(), { useCache: true });
  const rows = await db.collection(path)
    .find({})
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  return {
    ok: true,
    [key]: rows,
    source: 'ccp-mongo',
    sourceDb: ccpDbName(),
    sourceCollection: path
  };
}

function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function firstFilled(...values) {
  return values.find(isFilled) ?? '';
}

function normalizeYesNo(value) {
  if (value === true) return 'Yes';
  const raw = String(value || '').trim().toLowerCase();
  return ['yes', 'y', 'true', '1'].includes(raw) ? 'Yes' : 'No';
}

function normalizeCcpLead(row = {}) {
  const data = row.data || {};
  const basic = data.basic || row.basic || {};
  const contact = data.contact || row.contact || {};
  const address = data.address || data.registeredAddress || row.address || row.registeredAddress || {};
  const importMeta = data.importMeta || row.importMeta || {};

  const sourceLeadId = firstFilled(row.sourceLeadId, row._id, row.id, row.mongoId, row.uniqueId, row.leadId);
  const leadCode = firstFilled(row.leadCode, row.uniqueId, row.leadId, row.code, row.sourceLeadId, sourceLeadId);
  const company = firstFilled(
    row.company,
    row.companyName,
    row.clientName,
    row.name,
    basic.company,
    basic.companyName,
    basic.clientLegalName,
    basic.tradeName
  );

  return {
    ...row,
    sourceLeadId,
    leadCode,
    company,
    status: firstFilled(row.status, row.leadStatus, row.workflowStatus, row.stage, 'Draft'),
    industryType: firstFilled(row.industryType, row.industry, basic.industryType, basic.industry),
    eprCategory: firstFilled(row.eprCategory, row.epr, basic.eprCategory),
    piboCategory: firstFilled(row.piboCategory, row.pibo, basic.piboCategory),
    servicesOffered: firstFilled(row.servicesOffered, row.service, row.services, basic.servicesOffered),
    addressLine1: firstFilled(row.addressLine1, row.address, row.address1, address.addressLine1, address.line1, address.address),
    addressLine2: firstFilled(row.addressLine2, row.address2, address.addressLine2, address.line2),
    addressLine3: firstFilled(row.addressLine3, row.address3, address.addressLine3, address.line3),
    state: firstFilled(row.state, address.state),
    city: firstFilled(row.city, address.city),
    pinCode: firstFilled(row.pinCode, row.pin, row.pincode, address.pinCode, address.pin, address.pincode),
    existingClient: normalizeYesNo(firstFilled(row.existingClient, row.isExistingClient)),
    website: firstFilled(row.website, basic.website),
    contactPerson: firstFilled(row.contactPerson, row.contactName, contact.contactPerson, contact.name),
    designation: firstFilled(row.designation, contact.designation),
    emails: firstFilled(row.emails, row.email, contact.emails, contact.email),
    mobileNo1: firstFilled(row.mobileNo1, row.mobile1, row.mobile, row.phone, contact.mobileNo1, contact.mobile, contact.phone),
    mobileNo2: firstFilled(row.mobileNo2, row.mobile2, contact.mobileNo2),
    source: firstFilled(row.source, importMeta.source, 'ccp'),
    assignedToText: firstFilled(row.assignedToText, row.assignedTo?.name, importMeta.assignedTo),
    importedCreatedBy: firstFilled(row.importedCreatedBy, row.createdBy?.name, row.createdBy, importMeta.createdBy),
    importedCreatedAt: firstFilled(row.importedCreatedAt, row.createdAt, importMeta.createdAt),
    importedUpdatedAt: firstFilled(row.importedUpdatedAt, row.updatedAt, importMeta.updatedAt)
  };
}

function normalizeRowsForCrm(rows, key) {
  if (key !== 'leads') return rows;
  return rows.map(normalizeCcpLead);
}

function publicAssignedUser(user) {
  return {
    _id: user._id,
    id: user._id,
    ccpUserId: user.ccpUserId,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl
  };
}

async function buildUsersByIdentity() {
  const users = await User.find({ isActive: true }).select('ccpUserId name email role avatarUrl').lean();
  const usersByIdentity = new Map();
  users.forEach((user) => {
    [
      user._id,
      user.id,
      user.ccpUserId,
      user.crmUserId,
      user.name,
      user.email
    ].forEach((identity) => {
      const normalized = normalizeName(identity);
      if (normalized) usersByIdentity.set(normalized, publicAssignedUser(user));
    });
  });
  return usersByIdentity;
}

function resolveAssignedIdentity(row) {
  const value = String(
    row?.assignedToText
    || (typeof row?.assignedTo === 'string' ? row.assignedTo : '')
    || row?.assignedTo?._id
    || row?.assignedTo?.id
    || row?.assignedTo?.crmUserId
    || row?.assignedTo?.userId
    || row?.assignedTo?.ccpUserId
    || row?.assignedTo?.email
    || row?.data?.importMeta?.assignedTo
    || row?.data?.importMeta?.assignedToEmail
    || row?.data?.importMeta?.assignedToId
    || row?.data?.importMeta?.crmUserId
    || row?.data?.importMeta?.assignedToCrmUserId
    || row?.data?.importMeta?.assignedToUserId
    || row?.data?.importMeta?.ccpAssignedTo
    || (typeof row?.adminControls?.assignedTo === 'string' ? row.adminControls.assignedTo : '')
    || row?.adminControls?.assignedTo?._id
    || row?.adminControls?.assignedTo?.id
    || row?.adminControls?.assignedTo?.crmUserId
    || row?.adminControls?.assignedTo?.userId
    || row?.adminControls?.assignedTo?.ccpUserId
    || row?.adminControls?.assignedTo?.email
    || ''
  ).trim();
  return value;
}

function attachAssignedUserByIdentity(row, usersByIdentity, key) {
  const assignedIdentity = resolveAssignedIdentity(row);
  if (!assignedIdentity) return row;

  const user = usersByIdentity.get(normalizeName(assignedIdentity));
  if (!user) return row;

  if (key === 'clients') {
    return {
      ...row,
      adminControls: {
        ...(row.adminControls || {}),
        assignedTo: user
      },
      data: {
        ...(row.data || {}),
        importMeta: {
          ...(row.data?.importMeta || {}),
          assignedTo: user.name
        }
      }
    };
  }

  return {
    ...row,
    assignedTo: user,
    assignedToText: user.name
  };
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function visibleTextValues(row) {
  return [
    row?.assignedToText,
    typeof row?.assignedTo === 'string' ? row.assignedTo : row?.assignedTo?.name,
    row?.assignedTo?.email,
    row?.assignedTo?.ccpUserId,
    row?.assignedTo?.crmUserId,
    row?.assignedTo?.userId,
    row?.assignedTo?._id,
    row?.assignedTo?.id,
    row?.assignedBy,
    row?.createdBy,
    row?.importedCreatedBy,
    row?.data?.importMeta?.assignedTo,
    row?.data?.importMeta?.assignedToEmail,
    row?.data?.importMeta?.assignedToId,
    row?.data?.importMeta?.crmUserId,
    row?.data?.importMeta?.assignedToCrmUserId,
    row?.data?.importMeta?.assignedToUserId,
    row?.data?.importMeta?.ccpAssignedTo,
    row?.data?.importMeta?.createdBy,
    typeof row?.adminControls?.assignedTo === 'string' ? row.adminControls.assignedTo : row?.adminControls?.assignedTo?.name,
    row?.adminControls?.assignedTo?.email,
    row?.adminControls?.assignedTo?.ccpUserId,
    row?.adminControls?.assignedTo?.crmUserId,
    row?.adminControls?.assignedTo?.userId,
    row?.adminControls?.assignedTo?._id,
    row?.adminControls?.assignedTo?.id,
    row?.selectedLead?.assignedToText,
    typeof row?.selectedLead?.assignedTo === 'string' ? row.selectedLead.assignedTo : row?.selectedLead?.assignedTo?.name,
    row?.selectedLead?.assignedTo?.email,
    row?.selectedLead?.assignedTo?.ccpUserId,
    row?.selectedLead?.assignedTo?.crmUserId,
    row?.selectedLead?.assignedTo?.userId,
    row?.selectedLead?.assignedTo?._id,
    row?.selectedLead?.assignedTo?.id,
    row?.selectedLead?.importedCreatedBy,
    row?.selectedLead?.createdBy
  ].map(normalizeName).filter(Boolean);
}

function filterByScope(rows, scope) {
  if (scope === null) return rows;

  const identities = new Set((scope?.identities || []).map(normalizeName).filter(Boolean));
  const ids = new Set((scope?.ids || []).map((id) => String(id || '')).filter(Boolean));
  if (!identities.size && !ids.size) return [];

  return rows.filter((row) => {
    const assignedId = String(
      row?.assignedTo?._id
      || row?.assignedTo?.id
      || row?.assignedTo?.crmUserId
      || row?.assignedTo?.userId
      || row?.assignedTo?.ccpUserId
      || row?.adminControls?.assignedTo?._id
      || row?.adminControls?.assignedTo?.id
      || row?.adminControls?.assignedTo?.crmUserId
      || row?.adminControls?.assignedTo?.userId
      || row?.adminControls?.assignedTo?.ccpUserId
      || ''
    ).trim();
    if (assignedId && ids.has(assignedId)) return true;
    return visibleTextValues(row).some((value) => identities.has(value));
  });
}

function canReadAllCcpRows(user) {
  return CCP_FULL_ACCESS_ROLES.includes(String(user?.role || '').trim().toLowerCase());
}

async function fetchCcp(path, key, req, res) {
  const baseUrls = ccpBaseUrls();
  let lastError = '';

  try {
    const directRows = await fetchCcpRowsFromMongo(path, key);
    if (directRows[key].length) {
      const usersByIdentity = await buildUsersByIdentity();
      const scope = await getVisibleUserScope(req.user);
      const normalizedRows = normalizeRowsForCrm(directRows[key], key);
      const rows = normalizedRows.map((row) => attachAssignedUserByIdentity(row, usersByIdentity, key));
      directRows[key] = filterByScope(
        rows,
        canReadAllCcpRows(req.user) ? null : scope
      );
      return res.json(directRows);
    }
  } catch (err) {
    lastError = err.message || `Unable to read CCP ${path} from MongoDB`;
  }

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/${path}`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        lastError = payload.error || payload.message || `CCP ${path} returned ${response.status}`;
        continue;
      }

      const normalized = normalizeCollection(payload, key);
      const usersByIdentity = await buildUsersByIdentity();
      const scope = await getVisibleUserScope(req.user);
      const normalizedRows = normalizeRowsForCrm(normalized[key], key);
      const rows = normalizedRows.map((row) => attachAssignedUserByIdentity(row, usersByIdentity, key));
      normalized[key] = filterByScope(
        rows,
        canReadAllCcpRows(req.user) ? null : scope
      );
      normalized.sourceBaseUrl = baseUrl;
      return res.json(normalized);
    } catch (err) {
      lastError = err.message || `CCP backend is not reachable at ${baseUrl}`;
    }
  }

  return res.status(502).json({
    ok: false,
    error: `CCP backend is not reachable. Checked: ${baseUrls.join(', ')}.`,
    detail: lastError
  });
}

router.get('/leads', requireAuth, (req, res) => fetchCcp('leads', 'leads', req, res));
router.get('/clients', requireAuth, (req, res) => fetchCcp('clients', 'clients', req, res));

module.exports = router;
