const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');

const router = express.Router();
const TIMEOUT_MS = Number(process.env.CCP_FETCH_TIMEOUT_MS) || 15000;

const LEAD_FIELDS = [
  'sourceLeadId', 'communicationMode', 'status', 'company', 'industryType', 'eprCategory',
  'piboCategory', 'servicesOffered', 'addressLine1', 'addressLine2', 'addressLine3', 'landmark',
  'state', 'city', 'pinCode', 'existingClient', 'website', 'salutation', 'contactPerson',
  'designation', 'emails', 'emailsSentCount', 'lastEmailSent', 'mobileNo1', 'mobileNo2',
  'businessCardUrl', 'referredBy', 'source', 'notes', 'assignedTo', 'assignedToText',
  'assignedToEmail', 'assignedToCrmUserId', 'assignedBy', 'importedCreatedBy', 'leadDate',
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

function sanitizeLead(body, user) {
  const payload = pick(body, LEAD_FIELDS);
  const identity = creatorIdentity(user);
  payload.createdByCrmUserId = identity.createdByCrmUserId;
  payload.createdByEmail = identity.createdByEmail;
  payload.importedCreatedBy = identity.importedCreatedBy;
  if (payload.assignedTo && !/^[a-f\d]{24}$/i.test(String(payload.assignedTo))) delete payload.assignedTo;
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
    if (!response.ok) return res.status(response.status).json({ ok: false, error: payload.error || payload.message || `CCP ${resource} returned ${response.status}`, details: payload.details || payload.errors });
    return res.status(response.status).json(payload);
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'CCP write endpoint is not available. No CRM record was created.' });
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/leads', requireAuth, (req, res) => forward(req, res, 'GET', 'leads'));
router.post('/leads', requireAuth, (req, res) => forward(req, res, 'POST', 'leads', sanitizeLead(req.body, req.user)));
router.put('/leads/:id', requireAuth, (req, res) => forward(req, res, 'PUT', `leads/${encodeURIComponent(req.params.id)}`, sanitizeLead(req.body, req.user)));
router.get('/clients', requireAuth, (req, res) => forward(req, res, 'GET', 'clients'));
router.post('/clients', requireAuth, (req, res) => forward(req, res, 'POST', 'clients', sanitizeClient(req.body, req.user, ['admin', 'superadmin'].includes(req.user.role))));
router.put('/clients/:id', requireAuth, (req, res) => forward(req, res, 'PUT', `clients/${encodeURIComponent(req.params.id)}`, sanitizeClient(req.body, req.user, ['admin', 'superadmin'].includes(req.user.role))));

router._test = { LEAD_FIELDS, CLIENT_SECTIONS, pick, creatorIdentity, sanitizeLead, sanitizeClient };
module.exports = router;
