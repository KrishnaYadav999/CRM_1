const express = require('express');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { getVisibleUserScope } = require('../utils/visibilityScope');
const { ccpApiBaseUrl, ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');

const router = express.Router();

const CCP_FETCH_TIMEOUT_MS = Number(process.env.CCP_FETCH_TIMEOUT_MS) || 15000;
const CCP_FULL_ACCESS_ROLES = ROLES;

function ccpBaseUrls() {
  return [ccpApiBaseUrl()]
    .map((url) => String(url || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function ccpHistoryBaseUrls() {
  return [
    ccpApiBaseUrl().replace(/\/api$/i, '')
  ].map((url) => String(url || '').trim().replace(/\/+$/, '')).filter(Boolean).filter((url, index, urls) => urls.indexOf(url) === index);
}

function ccpApiHeaders(contentType = false, req = null) {
  const authorization = String(req?.get?.('authorization') || '').trim();
  return {
    ...ccpHeaders({ json: contentType }),
    ...(authorization ? { Authorization: authorization } : {})
  };
}

function nonEmptyQuery(input = {}) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value ?? '').trim()]).filter(([, value]) => value));
}

async function proxyCcpLeadHistory(req, res) {
  const query = nonEmptyQuery({ leadCode: req.query.leadCode, company: req.query.company });
  const suffix = new URLSearchParams(query).toString();
  let lastError = '';
  for (const baseUrl of ccpHistoryBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}/api/leads/${encodeURIComponent(req.params.id)}/history${suffix ? `?${suffix}` : ''}`, { headers: ccpApiHeaders(false, req) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return res.json({ ...payload, source: payload.source || 'ccp-history' });
      lastError = payload.error || payload.message || `CCP history returned ${response.status}`;
    } catch (err) { lastError = err.message || 'CCP history is unreachable'; }
  }
  return res.json({ ok: false, events: [], summary: { total: 0, quotations: 0, followUps: 0, todos: 0, emails: 0 }, error: 'CCP lead history is unavailable', detail: lastError, degraded: true });
}

async function proxyCcpEmailHistory(req, res) {
  const body = nonEmptyQuery({ leadCode: req.body.leadCode, company: req.body.company, recipient: req.body.recipient });
  let lastError = '';
  for (const baseUrl of ccpHistoryBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}/api/leads/${encodeURIComponent(req.params.id)}/history/email`, { method: 'POST', headers: ccpApiHeaders(true, req), body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return res.status(response.status).json(payload);
      lastError = payload.error || payload.message || `CCP email audit returned ${response.status}`;
    } catch (err) { lastError = err.message || 'CCP email audit is unreachable'; }
  }
  return res.status(502).json({ ok: false, error: 'CCP email audit is unavailable', detail: lastError });
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
  // Prefer CCP's business-facing lead number over its generated/internal code.
  const leadNumber = firstFilled(row.businessLeadCode, row.leadNumber, row['Lead Number'], importMeta.leadNumber);
  const leadCode = firstFilled(leadNumber, row.leadCode, row.uniqueId, row.leadId, row.code, row.sourceLeadId, sourceLeadId);
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
  const assignedBy = firstFilled(
    row.assignedBy?.name,
    typeof row.assignedBy === 'string' ? row.assignedBy : '',
    row.assignedByName,
    row['Assigned By'],
    importMeta.assignedBy,
    importMeta.assignedByName
  );
  const importedCreatedBy = firstFilled(
    row.importedCreatedBy,
    row.createdByName,
    row.createdBy?.name,
    row.createdBy?.email,
    typeof row.createdBy === 'string' ? row.createdBy : '',
    row['Created By'],
    importMeta.createdBy,
    importMeta.createdByName,
    importMeta.createdByEmail
  );

  return {
    ...row,
    sourceLeadId,
    leadNumber,
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
    assignedBy,
    importedCreatedBy,
    importedCreatedAt: firstFilled(row.importedCreatedAt, row.createdAt, importMeta.createdAt),
    importedUpdatedAt: firstFilled(row.importedUpdatedAt, row.updatedAt, importMeta.updatedAt)
  };
}

function normalizeRowsForCrm(rows, key) {
  if (key !== 'leads') return rows;
  return rows.map(normalizeCcpLead);
}

function isQuotationOnlyClientRecord(row = {}) {
  const data = row.data || {};
  const hasQuotation = Boolean(
    data.quotation?.quotationNumber
    || (Array.isArray(data.quotations) && data.quotations.length)
  );
  const hasClientMasterIdentity = Boolean(
    data.importMeta?.uniqueId
    || data.importMeta?.leadNumber
    || data.basic?.tradeName
    || data.registeredAddress?.state
    || data.basic?.piboCategory
    || data.basic?.eprCategory
    || data.cpcb?.status
    || data.otp?.mobile
  );
  return hasQuotation && !hasClientMasterIdentity;
}

function cleanCcpRowsForCrm(rows, key) {
  if (key === 'clients') return rows.filter((row) => !isQuotationOnlyClientRecord(row));
  return rows;
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

  for (const baseUrl of baseUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CCP_FETCH_TIMEOUT_MS);
    try {
      // CCP accepts the signed-in user's bearer token for read access. Forward it
      // so collection reads keep working even when an optional server-to-server
      // shared key is not configured on the CRM deployment.
      const response = await fetch(`${baseUrl}/ccp/${path}`, { headers: ccpApiHeaders(false, req), signal: controller.signal });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        lastError = payload.error || payload.message || `CCP ${path} returned ${response.status}`;
        continue;
      }

      const normalized = normalizeCollection(payload, key);
      const usersByIdentity = await buildUsersByIdentity();
      const scope = await getVisibleUserScope(req.user);
      const normalizedRows = normalizeRowsForCrm(cleanCcpRowsForCrm(normalized[key], key), key);
      const rows = normalizedRows.map((row) => attachAssignedUserByIdentity(row, usersByIdentity, key));
      normalized[key] = filterByScope(
        rows,
        canReadAllCcpRows(req.user) ? null : scope
      );
      normalized.sourceBaseUrl = baseUrl;
      return res.json(normalized);
    } catch (err) {
      lastError = err.message || `CCP backend is not reachable at ${baseUrl}`;
    } finally {
      clearTimeout(timeout);
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
router.get('/health', requireAuth, (req, res) => proxyCcpEndpoint(req, res, 'GET', 'ccp/health'));
router.get('/quotations', requireAuth, (req, res) => proxyCcpEndpoint(req, res, 'GET', 'ccp/quotations'));
router.get('/pending-approvals', requireAuth, (req, res) => proxyCcpEndpoint(req, res, 'GET', 'ccp/pending-approvals'));
router.patch('/clients/:id/approval', requireAuth, (req, res) => proxyCcpEndpoint(req, res, 'PATCH', `ccp/clients/${encodeURIComponent(req.params.id)}/approval`));
router.get('/leads/:id/history', requireAuth, proxyCcpLeadHistory);
router.post('/leads/:id/history/email', requireAuth, proxyCcpEmailHistory);

router._test = { nonEmptyQuery, ccpHistoryBaseUrls, ccpApiHeaders, isQuotationOnlyClientRecord, cleanCcpRowsForCrm };

module.exports = router;

async function proxyCcpEndpoint(req, res, method, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CCP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(ccpApiUrl(path), {
      method,
      headers: ccpApiHeaders(method !== 'GET', req),
      signal: controller.signal,
      ...(method !== 'GET' ? { body: JSON.stringify(req.body || {}) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    return res.status(response.status).json(payload);
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'CCP is waking up or temporarily unavailable. Please retry shortly.', detail: error.message });
  } finally {
    clearTimeout(timeout);
  }
}
