const express = require('express');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { getVisibleUserScope } = require('../utils/visibilityScope');

const router = express.Router();

const DEFAULT_CCP_API_BASE_URL = 'http://localhost:8081/api/ccp';
const CCP_FULL_ACCESS_ROLES = ROLES;

function normalizeCollection(payload, key) {
  if (Array.isArray(payload)) return { ok: true, [key]: payload };
  if (Array.isArray(payload?.[key])) return { ...payload, ok: payload.ok !== false };
  if (Array.isArray(payload?.data)) return { ok: true, [key]: payload.data };
  return { ok: payload?.ok !== false, [key]: [] };
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
  const baseUrl = (process.env.CCP_API_BASE_URL || DEFAULT_CCP_API_BASE_URL).replace(/\/+$/, '');

  try {
    const response = await fetch(`${baseUrl}/${path}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: payload.error || `Unable to fetch CCP ${path}`
      });
    }

    const normalized = normalizeCollection(payload, key);
    const usersByIdentity = await buildUsersByIdentity();
    const scope = await getVisibleUserScope(req.user);
    const rows = normalized[key].map((row) => attachAssignedUserByIdentity(row, usersByIdentity, key));
    normalized[key] = filterByScope(
      rows,
      canReadAllCcpRows(req.user) ? null : scope
    );
    return res.json(normalized);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: `CCP backend is not reachable at ${baseUrl}. Please keep CCP backend running on port 8081.`
    });
  }
}

router.get('/leads', requireAuth, (req, res) => fetchCcp('leads', 'leads', req, res));
router.get('/clients', requireAuth, (req, res) => fetchCcp('clients', 'clients', req, res));

module.exports = router;
