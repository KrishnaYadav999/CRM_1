const express = require('express');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');
const { ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');
const { normalizeParent, inferPiboParent, validatePiboSelection } = require('../utils/piboCategories');

const router = express.Router();
const TIMEOUT_MS = Number(process.env.CCP_FETCH_TIMEOUT_MS) || 15000;

const LEAD_FIELDS = [
  'sourceLeadId', 'communicationMode', 'status', 'company', 'industryType', 'eprCategory',
  'piboParent', 'piboCategoryParent', 'piboCategory', 'servicesOffered', 'addressLine1', 'addressLine2', 'addressLine3', 'landmark',
  'state', 'city', 'pinCode', 'existingClient', 'website', 'salutation', 'contactPerson',
  'designation', 'emails', 'emailsSentCount', 'lastEmailSent', 'mobileNo1', 'mobileNo2',
  'businessCardUrl', 'referredBy', 'source', 'notes', 'assignedTo', 'assignedToText',
  'assignedToEmail', 'assignedToCrmUserId', 'assignedBy', 'importedCreatedBy', 'leadDate',
  'updatedBy', 'updatedByEmail', 'updatedByCrmUserId', 'closedBy', 'closedByText',
  'closedByEmail', 'closedByCrmUserId', 'closedAt',
  'nextFollowUpDate', 'nextFollowUpTime', 'followUpRemarks', 'importedCreatedAt',
  'importedUpdatedAt', 'workflowStatus'
];

const CLIENT_SECTIONS = {
  basic: ['clientLegalName', 'tradeName', 'piboCategory', 'eprCategory', 'onboardingYear', 'firstAnnualReturnYear'],
  registeredAddress: ['address1', 'address2', 'address3', 'state', 'city', 'pincode'],
  communicationAddress: ['address1', 'address2', 'address3', 'state', 'city', 'pincode'],
  compliance: ['gstNumber', 'gstDate', 'gstFile', 'cinNumber', 'cinDate', 'cinFile', 'panNumber', 'panDate', 'panFile', 'factoryLicenseNumber', 'factoryLicenseDate', 'factoryLicenseFile', 'eprCertificateNumber', 'eprCertificateDate', 'eprCertificateFile', 'iecNumber', 'iecDate', 'iecFile', 'dicDcssiNumber', 'dicDcssiDate', 'dicDcssiFile'],
  cpcb: ['status', 'remark', 'homePageFile', 'registrationNumber', 'applicationDate', 'approvalDate', 'applicationNumber', 'ceprUserId', 'ceprPassword', 'loginId', 'loginPassword'],
  validation: ['quotationNumber', 'quotationDate', 'quotationFile', 'initialPurchaseOrderNumber', 'initialPurchaseOrderDate', 'initialPurchaseOrderFile'],
  otp: ['mobile', 'personName', 'designation'],
  authorised: ['name', 'designation', 'department', 'reportingPersonDetails', 'mobile', 'email', 'panNumber', 'panFile'],
  coordinating: ['name', 'designation', 'department', 'reportingPersonDetails', 'mobile', 'email'],
  importMeta: ['leadNumber', 'uniqueId', 'ccpClientId', 'companyName', 'createdBy', 'assignedTo']
};

function pick(source, fields) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(source, field)).map((field) => [field, source[field]]));
}

function creatorIdentity(user) {
  return {
    createdByCrmUserId: String(user?._id || user?.id || ''),
    createdByEmail: String(user?.email || '').trim().toLowerCase(),
    importedCreatedBy: String(user?.name || user?.email || '')
  };
}

function sanitizeLead(body, user, { isUpdate = false } = {}) {
  const payload = pick(body, LEAD_FIELDS);
  const identity = creatorIdentity(user);
  if (isUpdate) {
    delete payload.importedCreatedBy;
    payload.updatedByCrmUserId = identity.createdByCrmUserId;
    payload.updatedByEmail = identity.createdByEmail;
    payload.updatedBy = identity.importedCreatedBy;
  } else {
    payload.createdByCrmUserId = identity.createdByCrmUserId;
    payload.createdByEmail = identity.createdByEmail;
    payload.importedCreatedBy = identity.importedCreatedBy;
  }
  if (payload.assignedTo && !/^[a-f\d]{24}$/i.test(String(payload.assignedTo))) delete payload.assignedTo;
  if (payload.closedBy && !/^[a-f\d]{24}$/i.test(String(payload.closedBy))) delete payload.closedBy;
  payload.piboParent = normalizeParent(payload.piboParent || payload.piboCategoryParent) || inferPiboParent(payload.piboCategory) || '';
  delete payload.piboCategoryParent;
  return payload;
}

async function validatedLeadPayload(body, user, options) {
  const payload = sanitizeLead(body, user, options);
  if (payload.workflowStatus === 'submitted' || payload.piboParent || payload.piboCategory) {
    const selection = await validatePiboSelection({ parent: payload.piboParent, child: payload.piboCategory, required: true });
    payload.piboParent = selection.piboParent;
    payload.piboCategory = selection.piboCategory;
  }
  return payload;
}

function sanitizeClient(body, user, isAdmin = false) {
  const input = body?.data && typeof body.data === 'object' ? body.data : {};
  const data = {};
  Object.entries(CLIENT_SECTIONS).forEach(([section, fields]) => { data[section] = pick(input[section], fields); });
  data.msmeRows = Array.isArray(input.msmeRows) ? input.msmeRows.map((row) => pick(row, Object.keys(row || {}).filter((key) => !['__proto__', 'prototype', 'constructor'].includes(key)))) : [];
  data.cte = {
    numberOfPlantsLocations: input.cte?.numberOfPlantsLocations || '',
    plantWiseDetails: Array.isArray(input.cte?.plantWiseDetails) ? input.cte.plantWiseDetails.map((row) => pick(row, Object.keys(row || {}).filter((key) => !['__proto__', 'prototype', 'constructor'].includes(key)))) : []
  };
  data.cpcbScreenshots = Array.isArray(input.cpcbScreenshots)
    ? input.cpcbScreenshots.map((row) => pick(row, ['id', 'name', 'file']))
    : [];
  const admin = pick(body?.adminControls, ['visibilityStatus', 'assignedTo', 'assignedToText', 'assignedToEmail', 'assignedToCrmUserId', ...(isAdmin ? ['approvalStatus'] : [])]);
  if (!isAdmin) admin.approvalStatus = 'PENDING';
  if (admin.assignedTo && !/^[a-f\d]{24}$/i.test(String(admin.assignedTo))) delete admin.assignedTo;
  const identity = creatorIdentity(user);
  return {
    selectedLead: String(body?.selectedLead || ''),
    adminControls: admin,
    data,
    workflowStatus: body?.workflowStatus === 'submitted' ? 'submitted' : 'draft',
    createdByCrmUserId: identity.createdByCrmUserId,
    createdByEmail: identity.createdByEmail,
    createdByName: identity.importedCreatedBy
  };
}

async function forward(req, res, method, resource, body) {
  const result = await requestCcp(method, resource, body);
  return res.status(result.status).json(result.payload);
}

async function requestCcp(method, resource, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ccpApiUrl(`ccp/${resource}`), {
      method,
      headers: ccpHeaders({ json: method !== 'GET' }),
      signal: controller.signal,
      ...(method !== 'GET' ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { status: response.status, payload: { ok: false, error: payload.error || payload.message || `CCP ${resource} returned ${response.status}`, details: payload.details || payload.errors } };
    return { status: response.status, payload };
  } catch (error) {
    return { status: 503, payload: { ok: false, error: 'CCP write endpoint is not available. No CRM record was created.' } };
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/leads', requireAuth, (req, res) => forward(req, res, 'GET', 'leads'));
router.post('/leads', requireAuth, async (req, res) => {
  try { return forward(req, res, 'POST', 'leads', await validatedLeadPayload(req.body, req.user)); }
  catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.post('/leads/bulk', requireAuth, requireRoles(ADMIN_ROLES), async (req, res) => {
  const rows = Array.isArray(req.body?.leads) ? req.body.leads : [];
  if (!rows.length) return res.status(400).json({ error: 'No leads provided' });

  const integrationHeaders = ccpHeaders();
  if (!integrationHeaders['x-ccp-api-key'] && !integrationHeaders['x-ccp-secret']) {
    return res.status(503).json({
      ok: false,
      error: 'CCP integration credential is not configured in CRM backend. Set CCP_SHARED_SECRET (same value in CRM and CCP) or CCP_API_KEY, then restart both backends.'
    });
  }

  const leads = [];
  const failures = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const body = await validatedLeadPayload(rows[index], req.user);
      const result = await requestCcp('POST', 'leads', body);
      const lead = result.payload?.lead || result.payload?.data?.lead || result.payload?.data;
      if ([401, 403, 503].includes(result.status) && /credential|secret|api.?key|unauthori[sz]ed|forbidden/i.test(String(result.payload?.error || ''))) {
        return res.status(503).json({
          ok: false,
          error: `${result.payload.error}. Configure the same CCP_SHARED_SECRET in CRM and CCP, then restart both backends. No CRM lead was created.`
        });
      }
      if (result.status < 200 || result.status >= 300) throw new Error(result.payload?.error || 'CCP write failed');
      if (!lead || typeof lead !== 'object') throw new Error('CCP did not return the saved lead');
      leads.push(lead);
    } catch (error) {
      failures.push({ row: index + 1, error: error.message || 'CCP write failed' });
    }
  }

  return res.status(failures.length && !leads.length ? 400 : 201).json({
    ok: failures.length === 0,
    imported: leads.length,
    failed: failures.length,
    leads,
    failures
  });
});
router.put('/leads/:id', requireAuth, async (req, res) => {
  try { return forward(req, res, 'PUT', `leads/${encodeURIComponent(req.params.id)}`, await validatedLeadPayload(req.body, req.user, { isUpdate: true })); }
  catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.get('/clients', requireAuth, (req, res) => forward(req, res, 'GET', 'clients'));
router.post('/clients', requireAuth, (req, res) => forward(req, res, 'POST', 'clients', sanitizeClient(req.body, req.user, ['admin', 'superadmin'].includes(req.user.role))));
router.post('/clients/bulk', requireAuth, requireRoles(ADMIN_ROLES), async (req, res) => {
  const rows = Array.isArray(req.body?.clients) ? req.body.clients : [];
  if (!rows.length) return res.status(400).json({ error: 'No clients provided' });

  const integrationHeaders = ccpHeaders();
  if (!integrationHeaders['x-ccp-api-key'] && !integrationHeaders['x-ccp-secret']) {
    return res.status(503).json({ ok: false, error: 'CCP integration credential is not configured in CRM backend.' });
  }

  const clients = rows.map((row) => sanitizeClient(row, req.user, ['admin', 'superadmin'].includes(req.user.role)));
  const result = await requestCcp('POST', 'clients/bulk', { clients });
  if (result.status === 404) {
    return res.status(501).json({
      ok: false,
      error: 'CCP client bulk write endpoint is not installed. Add POST /api/ccp/clients/bulk in CCP; no CRM client was created.'
    });
  }
  return res.status(result.status).json(result.payload);
});
router.post('/clients/years/bulk', requireAuth, requireRoles(ADMIN_ROLES), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'No annual return year rows provided' });
  return forward(req, res, 'POST', 'clients/years/bulk', { rows: rows.map((row, index) => ({
    row: Number(row.row) || index + 2,
    companyUniqueId: String(row.companyUniqueId || '').trim(),
    onboardingYear: String(row.onboardingYear || '').trim(),
    firstAnnualReturnYear: String(row.firstAnnualReturnYear || '').trim()
  })) });
});
router.put('/clients/:id', requireAuth, (req, res) => forward(req, res, 'PUT', `clients/${encodeURIComponent(req.params.id)}`, sanitizeClient(req.body, req.user, ['admin', 'superadmin'].includes(req.user.role))));

router._test = { LEAD_FIELDS, CLIENT_SECTIONS, pick, creatorIdentity, sanitizeLead, sanitizeClient, validatedLeadPayload };
module.exports = router;
