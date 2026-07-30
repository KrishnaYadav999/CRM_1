const express = require('express');
const {
  applySavedLeadAssignments,
  appendLeadActivity,
  saveLeadAssignments,
  saveLeadServiceSelections
} = require('../services/leadAssignmentPersistence');
const { registerStaffOnboardingAssignments } = require('../services/staffOnboardingWorkflow');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/roles');
const { ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');
const { normalizeParent, inferPiboParent, validatePiboSelection } = require('../utils/piboCategories');
const liveClientSyncController = require('../controllers/liveClientSyncController');
const { trackManualClientSave } = require('../services/clientOnboardingReminders');
const PendingApproval = require('../models/PendingApproval');
const User = require('../models/User');
const { notifyLeadAssignment } = require('../services/leadAssignmentNotifications');
const { notifyNewFinancialYear } = require('../services/leadFinancialYearNotifications');
const { notifyAdditionalLeadServices } = require('../services/leadServiceContributorNotifications');
const { claimLeadRoyalty } = require('../services/leadRoyaltyNotifications');
const { sendLeadClosureKickoffEmail } = require('../services/leadClosureKickoffEmail');
const { externalId, persistCcpLead, persistCcpClient } = require('../services/crmRecordPersistence');

const router = express.Router();
const TIMEOUT_MS = Number(process.env.CCP_FETCH_TIMEOUT_MS) || 15000;

const LEAD_FIELDS = [
  'leadCode', 'sourceLeadId', 'communicationMode', 'communicationModeNote', 'status', 'company', 'industryType', 'eprCategory',
  'piboParent', 'piboCategoryParent', 'piboCategory', 'applicantType', 'serviceSelections', 'servicesOffered', 'firstAnnualReturnYearApplicable', 'addresses', 'contacts', 'assignments', 'addressLine1', 'addressLine2', 'addressLine3', 'landmark',
  'state', 'city', 'pinCode', 'existingClient', 'website', 'salutation', 'contactPerson',
  'designation', 'emails', 'emailsSentCount', 'lastEmailSent', 'mobileNo1', 'mobileNo2',
  'businessCardUrl', 'referredBy', 'source', 'notes', 'assignedTo', 'assignedToText',
  'assignedToEmail', 'assignedToCrmUserId', 'assignedStaff', 'assignedStaffText', 'assignedStaffEmail', 'assignedBy', 'importedCreatedBy', 'leadDate',
  'updatedBy', 'updatedByEmail', 'updatedByCrmUserId', 'closedBy', 'closedByText',
  'closedByEmail', 'closedByCrmUserId', 'closedAt',
  'nextFollowUpDate', 'nextFollowUpTime', 'followUpRemarks', 'followUpHistory', 'importedCreatedAt',
  'importedUpdatedAt', 'workflowStatus', 'recordStatus', 'followUpFlag', 'followUpPriority', 'complianceHealthReport'
];

const CLIENT_SECTIONS = {
  companyOverview: ['companyName', 'companySummary', 'overviewItems', 'productName', 'productManufacturer', 'productImage', 'category', 'numberOfEmployees'],
  basic: ['clientLegalName', 'tradeName', 'piboCategory', 'eprCategory', 'onboardingYear', 'firstAnnualReturnYear'],
  registeredAddress: ['address1', 'address2', 'address3', 'state', 'city', 'pincode'],
  communicationAddress: ['address1', 'address2', 'address3', 'state', 'city', 'pincode'],
  compliance: ['gstNumber', 'gstDate', 'gstFile', 'cinNumber', 'cinDate', 'cinFile', 'panNumber', 'panDate', 'panFile', 'factoryLicenseNumber', 'factoryLicenseDate', 'factoryLicenseFile', 'eprCertificateNumber', 'eprCertificateDate', 'eprCertificateFile', 'iecNumber', 'iecDate', 'iecFile', 'dicDcssiNumber', 'dicDcssiDate', 'dicDcssiFile'],
  cpcb: ['linkedToCommonPortal', 'status', 'remark', 'homePageFile', 'registrationNumber', 'applicationDate', 'approvalDate', 'applicationNumber', 'ceprUserId', 'ceprPassword', 'loginId', 'loginPassword', 'unitId'],
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

function normalizeCompanyIdentity(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bPRIVATE\s+LIMITED\b/g, ' PVT LTD ')
    .replace(/\bLIMITED\b/g, ' LTD ')
    .replace(/\bCORPORATION\b/g, ' CORP ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function ccpLeadList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const value of [payload?.leads, payload?.data, payload?.data?.leads, payload?.items, payload?.rows]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function leadOwnerName(lead = {}) {
  return String(
    lead.importedCreatedBy
    || lead.createdByName
    || lead.createdBy?.name
    || lead.createdBy?.email
    || lead.assignedToText
    || lead.assignedTo?.name
    || lead.updatedByText
    || 'another user'
  ).trim();
}

function leadIdentity(lead = {}) {
  return String(lead._id || lead.id || lead.sourceLeadId || lead.ccpLeadId || lead.externalLeadId || '').trim();
}

function royaltyIdentityTokens(...values) {
  const identity = (value) => String(value || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ');
  return [...new Set(values.flatMap((value) => value && typeof value === 'object'
    ? [value._id, value.id, value.crmUserId, value.ccpUserId, value.email, value.name]
    : [value]).filter(Boolean).map(identity).filter(Boolean))];
}

function royaltyContributorEligibility(lead = {}, claimant = {}) {
  const originalIds = royaltyIdentityTokens(lead.createdBy, lead.createdByCrmUserId, lead.createdByEmail, lead.createdByName, lead.importedCreatedBy);
  const claimantIds = royaltyIdentityTokens(claimant._id, claimant.id, claimant.crmUserId, claimant.ccpUserId, claimant.email, claimant.name);
  if (originalIds.some((value) => claimantIds.includes(value))) {
    return { eligible: false, reason: 'same-user', originalIds, claimantIds, distinctContributors: [] };
  }

  const assignments = Array.isArray(lead.assignments) ? lead.assignments : [];
  const contributorGroups = (Array.isArray(lead.serviceSelections) ? lead.serviceSelections : [])
    .map((row, index) => {
      const assignment = assignments[index] || {};
      return royaltyIdentityTokens(
        row?.createdByCrmUserId, row?.createdByEmail, row?.createdByName,
        assignment?.closedBy, assignment?.closedByEmail, assignment?.closedByText
      );
    })
    .filter((tokens) => tokens.length);
  if (originalIds.length && !contributorGroups.some((tokens) => tokens.some((token) => originalIds.includes(token)))) {
    contributorGroups.unshift(originalIds);
  }
  const distinctContributors = [];
  contributorGroups.forEach((tokens) => {
    if (!distinctContributors.some((known) => known.some((token) => tokens.includes(token)))) distinctContributors.push(tokens);
  });
  const claimantContributed = distinctContributors.some((tokens) => tokens.some((token) => claimantIds.includes(token)));
  return {
    eligible: distinctContributors.length >= 2 && claimantContributed,
    reason: distinctContributors.length < 2 ? 'insufficient-contributors' : claimantContributed ? '' : 'claimant-not-contributor',
    originalIds,
    claimantIds,
    distinctContributors
  };
}

function enforceAssignmentPermissions(assignments = [], existingAssignments = [], user = {}) {
  const role = String(user?.role || '').trim().toLowerCase();
  if (['admin', 'superadmin'].includes(role)) return assignments;
  const userIds = [user?._id, user?.id, user?.crmUserId, user?.ccpUserId].filter(Boolean).map(String);

  return assignments.map((row = {}, index) => {
    const existing = existingAssignments[index] || {};
    if (role === 'manager') {
      const managerId = String(row.assignedTo || existing.assignedTo || '');
      if (row.assignedStaff && !userIds.includes(managerId)) {
        const error = new Error(`Assignment row ${index + 1}: a manager can assign staff only for leads assigned to that manager.`);
        error.statusCode = 403;
        throw error;
      }
      return row;
    }

    // Sales and other non-manager roles may close a service row and assign its
    // manager. They cannot create or alter manager-to-staff assignments. Frozen
    // staff values from an older row must still round-trip unchanged.
    return {
      ...row,
      ...(existing.closedBy ? {
        closedBy: existing.closedBy,
        closedByText: existing.closedByText || '',
        closedByEmail: existing.closedByEmail || ''
      } : {}),
      ...(existing.assignedTo ? {
        assignedTo: existing.assignedTo,
        assignedToText: existing.assignedToText || '',
        assignedToEmail: existing.assignedToEmail || ''
      } : {}),
      assignedStaff: existing.assignedStaff || '',
      assignedStaffText: existing.assignedStaffText || '',
      assignedStaffEmail: existing.assignedStaffEmail || ''
    };
  });
}

async function findDuplicateCompany(company, excludeId = '') {
  const identity = normalizeCompanyIdentity(company);
  if (!identity) return null;
  const result = await requestCcp('GET', 'leads');
  if (result.status < 200 || result.status >= 300) {
    const error = new Error('Unable to verify whether this company already exists. Lead creation is blocked until the CCP database is available.');
    error.statusCode = 503;
    throw error;
  }
  return ccpLeadList(result.payload).find((lead) => {
    const companyName = lead.company || lead.companyName || lead.clientName || lead.name || lead.data?.basic?.companyName || lead.data?.basic?.clientLegalName;
    return normalizeCompanyIdentity(companyName) === identity && (!excludeId || leadIdentity(lead) !== String(excludeId));
  }) || null;
}

async function findCcpLeadById(id) {
  const result = await requestCcp('GET', 'leads');
  if (result.status < 200 || result.status >= 300) return null;
  return ccpLeadList(result.payload).find((lead) => leadIdentity(lead) === String(id)) || null;
}

async function getNextCcpLeadCode() {
  const result = await requestCcp('GET', 'leads');
  if (result.status < 200 || result.status >= 300) {
    const error = new Error('Unable to generate the next Lead ID because the CCP database is unavailable.');
    error.statusCode = 503;
    throw error;
  }
  const latestNumber = ccpLeadList(result.payload).reduce((maximum, lead) => {
    const code = String(lead.leadCode || lead.leadNumber || '').trim();
    const match = code.match(/^ATPL(?:-LEAD)?-(\d+)$/i);
    return match ? Math.max(maximum, Number(match[1]) || 0) : maximum;
  }, 0);
  return `ATPL-${String(latestNumber + 1).padStart(4, '0')}`;
}

function duplicateLeadResponse(res, duplicate) {
  const ownerName = leadOwnerName(duplicate);
  return res.status(409).json({
    ok: false,
    code: 'DUPLICATE_LEAD_COMPANY',
    error: `This lead has already been generated by ${ownerName}. You cannot create or update this lead.`,
    duplicate: {
      id: leadIdentity(duplicate),
      company: duplicate.company || duplicate.companyName || duplicate.clientName || duplicate.name || '',
      ownerName,
      leadCode: duplicate.leadCode || duplicate.leadNumber || duplicate.sourceLeadId || ''
    }
  });
}

async function hasApprovedDuplicateOverride(user, company) {
  const companyIdentity = normalizeCompanyIdentity(company);
  const userId = String(user?._id || user?.id || '');
  if (!companyIdentity || !userId) return false;
  const record = await PendingApproval.findOne({
    type: 'lead_duplicate',
    approvalStatus: 'APPROVED',
    'payload.companyIdentity': companyIdentity,
    'payload.requestedById': userId
  }).lean();
  return record || null;
}

function creatorIdentity(user) {
  return {
    createdByCrmUserId: String(user?._id || user?.id || ''),
    createdByEmail: String(user?.email || '').trim().toLowerCase(),
    importedCreatedBy: String(user?.name || user?.email || '')
  };
}

function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function stripInvalidObjectId(payload, field) {
  if (!isObjectId(payload[field])) delete payload[field];
}

function sanitizeLead(body, user, { isUpdate = false } = {}) {
  const payload = pick(body, LEAD_FIELDS);
  if (Array.isArray(payload.serviceSelections)) {
    payload.serviceSelections = payload.serviceSelections.slice(0, 25).map((row) => pick(row, ['industryType', 'eprCategory', 'applicantType', 'piboCategory', 'servicesOffered', 'applicableService', 'firstAnnualReturnYearApplicable', 'createdByCrmUserId', 'createdByName', 'createdByEmail']));
  }
  const primaryService = payload.serviceSelections?.[0];
  if (primaryService) {
    payload.industryType = primaryService.industryType || payload.industryType;
    payload.eprCategory = primaryService.eprCategory || payload.eprCategory;
    payload.applicantType = primaryService.applicantType || payload.applicantType;
    payload.piboCategory = primaryService.piboCategory || payload.piboCategory;
    payload.servicesOffered = primaryService.servicesOffered || payload.servicesOffered;
    payload.firstAnnualReturnYearApplicable = primaryService.firstAnnualReturnYearApplicable || payload.firstAnnualReturnYearApplicable;
  }
  if (Array.isArray(payload.addresses)) {
    payload.addresses = payload.addresses.slice(0, 25).map((row) => pick(row, ['addressLine1', 'addressLine2', 'addressLine3', 'landmark', 'state', 'city', 'pinCode', 'existingClient', 'website']));
  }
  if (Array.isArray(payload.contacts)) {
    payload.contacts = payload.contacts.slice(0, 25).map((row) => pick(row, ['salutation', 'contactPerson', 'designation', 'emails', 'mobileNo1', 'mobileNo2', 'referredBy', 'source', 'businessCardUrl']));
  }
  if (Array.isArray(payload.assignments)) {
    payload.assignments = payload.assignments.slice(0, 25).map((row) => pick(row, [
      'assignedTo', 'assignedToText', 'assignedToEmail',
      'closedBy', 'closedByText', 'closedByEmail',
      'assignedStaff', 'assignedStaffText', 'assignedStaffEmail'
    ]));
  }
  const identity = creatorIdentity(user);
  if (isUpdate) {
    delete payload.importedCreatedBy;
    payload.updatedByCrmUserId = identity.createdByCrmUserId;
    payload.updatedByEmail = identity.createdByEmail;
    payload.updatedByText = identity.importedCreatedBy;
    stripInvalidObjectId(payload, 'updatedBy');
  } else {
    payload.createdByCrmUserId = identity.createdByCrmUserId;
    payload.createdByEmail = identity.createdByEmail;
    payload.importedCreatedBy = identity.importedCreatedBy;
    stripInvalidObjectId(payload, 'updatedBy');
  }
  stripInvalidObjectId(payload, 'assignedTo');
  stripInvalidObjectId(payload, 'assignedStaff');
  stripInvalidObjectId(payload, 'closedBy');
  payload.piboParent = normalizeParent(payload.piboParent || payload.piboCategoryParent) || inferPiboParent(payload.piboCategory) || '';
  delete payload.piboCategoryParent;
  return payload;
}

async function validatedLeadPayload(body, user, options) {
  const payload = sanitizeLead(body, user, options);
  const generatedForUserId = String(body?.generatedForUserId || '').trim();
  if (generatedForUserId) {
    const conditions = [{ crmUserId: generatedForUserId }, { ccpUserId: generatedForUserId }];
    if (/^[a-f\d]{24}$/i.test(generatedForUserId)) conditions.unshift({ _id: generatedForUserId });
    const generatedFor = await User.findOne({ $or: conditions, isActive: { $ne: false } }).select('_id name email').lean();
    if (!generatedFor) {
      const error = new Error('Selected generated-for user is not active or does not exist.');
      error.statusCode = 400;
      throw error;
    }
    const actualCreatorIds = [user?._id, user?.id, user?.crmUserId, user?.ccpUserId].filter(Boolean).map(String);
    const selectedIdentity = {
      id: String(generatedFor._id),
      name: generatedFor.name || generatedFor.email,
      email: generatedFor.email || ''
    };
    if (!options?.isUpdate) {
      payload.createdByCrmUserId = selectedIdentity.id;
      payload.createdByEmail = selectedIdentity.email;
      payload.importedCreatedBy = selectedIdentity.name;
    }
    if (Array.isArray(payload.serviceSelections)) {
      payload.serviceSelections = payload.serviceSelections.map((row) => {
        const ownerId = String(row?.createdByCrmUserId || '');
        if (options?.isUpdate && ownerId && !actualCreatorIds.includes(ownerId)) return row;
        return {
          ...row,
          createdByCrmUserId: selectedIdentity.id,
          createdByName: selectedIdentity.name,
          createdByEmail: selectedIdentity.email
        };
      });
    }
  }
  const invalidManagerAssignmentIndex = Array.isArray(payload.assignments)
    ? payload.assignments.findIndex((row) => row?.assignedTo && !row?.closedBy)
    : -1;
  if (invalidManagerAssignmentIndex >= 0 || (payload.assignedTo && !payload.closedBy)) {
    const error = new Error(`Assignment row ${Math.max(0, invalidManagerAssignmentIndex) + 1}: close the lead before assigning it to a manager.`);
    error.statusCode = 400;
    throw error;
  }
  const managerIds = [user?._id, user?.id, user?.crmUserId, user?.ccpUserId].filter(Boolean).map(String);
  const staffAssignments = Array.isArray(payload.assignments) ? payload.assignments.filter((row) => row?.assignedStaff) : [];
  const role = String(user?.role || '').toLowerCase();
  const canAssignAnyStaff = ['admin', 'superadmin'].includes(role);
  if (!options?.isUpdate && (payload.assignedStaff || staffAssignments.length) && role !== 'manager' && !canAssignAnyStaff) {
    delete payload.assignedStaff;
    delete payload.assignedStaffText;
    delete payload.assignedStaffEmail;
    delete payload.assignments;
  }
  if (!options?.isUpdate && role === 'manager' && !canAssignAnyStaff && staffAssignments.some((row) => !managerIds.includes(String(row.assignedTo || '')))) {
    const error = new Error('A manager can assign staff only for leads assigned to that manager.');
    error.statusCode = 403;
    throw error;
  }
  const category = String(payload.eprCategory || payload.serviceSelections?.[0]?.eprCategory || '');
  const applicant = String(payload.applicantType || payload.serviceSelections?.[0]?.applicantType || '').trim();
  const isTyre = /\btyre\b/i.test(category);
  const isEWaste = /\be-?waste\b/i.test(category);
  const isBattery = /\bbattery\b/i.test(category);
  const isUsedOil = /\bused\s+oil\b/i.test(category);
  const allowedApplicants = isTyre
    ? ['Producer', 'Recycler', 'Retreader']
    : isEWaste
      ? ['Producer', 'Manufacturer', 'Recycler', 'Refurbisher']
      : isBattery
        ? ['Producer', 'Recycler', 'Refurbisher']
        : isUsedOil
          ? ['Producers', 'Collection Agents', 'Recyclers', 'Used Oil Importers']
        : null;
  if (allowedApplicants) {
    if (!applicant) {
      const error = new Error(`Applicant Type is required for ${category.replace(/^EPR\s*-\s*/i, '')}.`);
      error.statusCode = 400;
      throw error;
    }
    payload.applicantType = applicant;
    const compatibility = ['Producer', 'Producers'].includes(applicant)
      ? { piboParent: 'PIBO', piboCategory: 'Producer' }
      : applicant === 'Manufacturer'
        ? { piboParent: 'SIMP', piboCategory: 'Manufacturer of Raw Material' }
        : ['Recycler', 'Recyclers'].includes(applicant)
        ? { piboParent: 'PWP', piboCategory: 'Recycler' }
        : applicant === 'Collection Agents'
          ? { piboParent: 'SIMP', piboCategory: 'Seller' }
        : applicant === 'Used Oil Importers'
          ? { piboParent: 'SIMP', piboCategory: 'Importer of Raw Material' }
        : applicant === 'Refurbisher'
          ? { piboParent: 'PWP', piboCategory: 'Refurbisher' }
        : { piboParent: 'SIMP', piboCategory: 'Seller' };
    Object.assign(payload, compatibility);
  }
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
  data.processDiagrams = Array.isArray(input.processDiagrams)
    ? input.processDiagrams.map((row) => pick(row, ['id', 'name', 'file']))
    : [];
  const admin = pick(body?.adminControls, ['visibilityStatus', 'assignedTo', 'assignedToText', 'assignedToEmail', 'assignedToCrmUserId', ...(isAdmin ? ['approvalStatus'] : [])]);
  if (!isAdmin) admin.approvalStatus = 'PENDING';
  stripInvalidObjectId(admin, 'assignedTo');
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
router.post('/sync-to-crm', requireAuth, requireRoles(ADMIN_ROLES), async (req, res) => {
  const [leadResult, clientResult] = await Promise.all([
    requestCcp('GET', 'leads'),
    requestCcp('GET', 'clients')
  ]);
  if (leadResult.status < 200 || leadResult.status >= 300 || clientResult.status < 200 || clientResult.status >= 300) {
    return res.status(502).json({
      ok: false,
      error: 'CCP data could not be read completely; CRM backfill was not started.',
      leadsError: leadResult.payload?.error,
      clientsError: clientResult.payload?.error
    });
  }

  const sourceLeads = ccpLeadList(leadResult.payload);
  const sourceClients = Array.isArray(clientResult.payload?.clients)
    ? clientResult.payload.clients
    : Array.isArray(clientResult.payload?.data?.clients)
      ? clientResult.payload.data.clients
      : Array.isArray(clientResult.payload) ? clientResult.payload : [];
  const summary = { leads: { total: sourceLeads.length, saved: 0, failed: 0 }, clients: { total: sourceClients.length, saved: 0, failed: 0 } };
  const failures = [];

  for (const lead of sourceLeads) {
    try {
      await persistCcpLead({ requestPayload: lead, responsePayload: { lead }, user: req.user });
      summary.leads.saved += 1;
    } catch (error) {
      summary.leads.failed += 1;
      failures.push({ type: 'lead', id: leadIdentity(lead), error: error.message });
    }
  }
  for (const client of sourceClients) {
    try {
      await persistCcpClient({ requestPayload: client, responsePayload: { client }, user: req.user });
      summary.clients.saved += 1;
    } catch (error) {
      summary.clients.failed += 1;
      failures.push({ type: 'client', id: externalId(client), error: error.message });
    }
  }
  return res.status(failures.length ? 207 : 200).json({ ok: failures.length === 0, summary, failures });
});
router.post('/leads', requireAuth, async (req, res) => {
  try {
    const duplicate = await findDuplicateCompany(req.body?.company);
    const duplicateApproval = duplicate ? await hasApprovedDuplicateOverride(req.user, req.body?.company) : null;
    if (duplicate && !duplicateApproval) return duplicateLeadResponse(res, duplicate);
    const payload = await validatedLeadPayload(req.body, req.user);
    if (duplicateApproval?.payload?.selectedUserId) {
      const selectedUserId = String(duplicateApproval.payload.selectedUserId);
      const selectedUser = (duplicateApproval.payload.candidateUsers || []).find((item) => String(item.id) === selectedUserId);
      payload.assignedToCrmUserId = selectedUserId;
      payload.assignedToText = selectedUser?.name || payload.assignedToText || '';
    }
    payload.leadCode = payload.leadCode && !/^[a-f\d]{24}$/i.test(payload.leadCode) ? payload.leadCode : await getNextCcpLeadCode();
    const result = await requestCcp('POST', 'leads', payload);
    const savedLead = result.payload?.lead || result.payload?.data?.lead || result.payload?.data;
    if (result.status >= 200 && result.status < 300 && savedLead) {
      const savedKey = String(savedLead._id || savedLead.id || savedLead.sourceLeadId || payload.leadCode || '');
      if (Array.isArray(payload.assignments)) await saveLeadAssignments(savedKey, payload.assignments, req.user);
      if (Array.isArray(payload.serviceSelections)) await saveLeadServiceSelections(savedKey, payload.serviceSelections, req.user);
      await appendLeadActivity(savedKey, {
        type: 'lead_created',
        title: 'Lead created',
        description: `${payload.company || 'Lead'} generated for ${payload.importedCreatedBy || req.user.name || req.user.email}`,
        actor: req.user.name || req.user.email
      });
    }
    if (result.status >= 200 && result.status < 300 && savedLead && payload.assignedToCrmUserId) {
      await notifyLeadAssignment({ lead: savedLead, managerId: payload.assignedToCrmUserId, assignedBy: req.user });
    }
    if (result.status >= 200 && result.status < 300 && savedLead) {
      const authoritativeLead = {
        ...savedLead,
        ...(Array.isArray(payload.serviceSelections) ? { serviceSelections: payload.serviceSelections } : {}),
        ...(Array.isArray(payload.assignments) ? { assignments: payload.assignments } : {})
      };
      await sendLeadClosureKickoffEmail({ beforeLead: {}, lead: authoritativeLead })
        .catch((error) => console.error('Lead closure kick-off email failed', error));
      const crmLead = await persistCcpLead({
        requestPayload: payload,
        responsePayload: { lead: authoritativeLead },
        user: req.user
      });
      return res.status(result.status).json({ ...result.payload, lead: authoritativeLead, crmRecordId: crmLead._id });
    }
    return res.status(result.status).json(result.payload);
  }
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
      const duplicate = await findDuplicateCompany(rows[index]?.company);
      if (duplicate) throw new Error(`This lead has already been generated by ${leadOwnerName(duplicate)}. You cannot create or update this lead.`);
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
      const crmLead = await persistCcpLead({
        requestPayload: body,
        responsePayload: { lead },
        user: req.user
      });
      lead.crmRecordId = crmLead._id;
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
  try {
    const ccpBeforeLead = await findCcpLeadById(req.params.id);
    const [beforeLead] = ccpBeforeLead
      ? await applySavedLeadAssignments([ccpBeforeLead])
      : [{}];
    if (req.body?.company) {
      const duplicate = await findDuplicateCompany(req.body.company, req.params.id);
      if (duplicate) return duplicateLeadResponse(res, duplicate);
    }
    const payload = await validatedLeadPayload(req.body, req.user, { isUpdate: true });
    if (Array.isArray(payload.assignments)) {
      payload.assignments = enforceAssignmentPermissions(
        payload.assignments,
        Array.isArray(beforeLead?.assignments) ? beforeLead.assignments : [],
        req.user
      );
    }
    if (beforeLead && Array.isArray(payload.serviceSelections) && Array.isArray(beforeLead.serviceSelections)) {
      const actorIds = [req.user?._id, req.user?.id, req.user?.email, req.user?.name].filter(Boolean).map((value) => String(value).trim().toLowerCase());
      payload.serviceSelections = payload.serviceSelections.map((row, index) => {
        const existingRow = beforeLead.serviceSelections[index];
        if (!existingRow) return row;
        const owners = [existingRow.createdByCrmUserId, existingRow.createdByEmail, existingRow.createdByName].filter(Boolean).map((value) => String(value).trim().toLowerCase());
        return owners.length && !owners.some((value) => actorIds.includes(value)) ? existingRow : row;
      });
      beforeLead.serviceSelections.slice(payload.serviceSelections.length).forEach((existingRow) => {
        const owners = [existingRow.createdByCrmUserId, existingRow.createdByEmail, existingRow.createdByName].filter(Boolean).map((value) => String(value).trim().toLowerCase());
        if (owners.length && !owners.some((value) => actorIds.includes(value))) payload.serviceSelections.push(existingRow);
      });
    }
    const result = await requestCcp('PUT', `leads/${encodeURIComponent(req.params.id)}`, payload);
    const savedLead = result.payload?.lead || result.payload?.data?.lead || result.payload?.data;
    if (result.status >= 200 && result.status < 300 && Array.isArray(payload.assignments)) {
      await saveLeadAssignments(req.params.id, payload.assignments, req.user);
      await registerStaffOnboardingAssignments({
        lead: { ...(beforeLead || {}), ...payload, _id: req.params.id },
        manager: req.user
      }).catch((error) => console.error('Staff onboarding assignment notification failed', error));
    }
    if (result.status >= 200 && result.status < 300 && Array.isArray(payload.serviceSelections)) {
      await saveLeadServiceSelections(req.params.id, payload.serviceSelections, req.user);
    }
    if (result.status >= 200 && result.status < 300) {
      const changedAreas = [
        Array.isArray(payload.serviceSelections) ? 'services' : '',
        Array.isArray(payload.assignments) ? 'assignments' : '',
        payload.nextFollowUpDate || payload.followUpRemarks ? 'follow-up' : '',
        payload.status ? 'status/details' : ''
      ].filter(Boolean);
      await appendLeadActivity(req.params.id, {
        type: Array.isArray(payload.assignments) ? 'assignment_updated' : 'lead_updated',
        title: Array.isArray(payload.assignments) ? 'Lead assignment updated' : 'Lead updated',
        description: changedAreas.length ? `Updated ${changedAreas.join(', ')}` : 'Lead details updated',
        actor: req.user.name || req.user.email
      });
    }
    if (result.status >= 200 && result.status < 300 && savedLead && payload.assignedToCrmUserId) {
      await notifyLeadAssignment({ lead: savedLead, managerId: payload.assignedToCrmUserId, assignedBy: req.user });
    }
    if (result.status >= 200 && result.status < 300 && savedLead && req.body?.addServicesMode) {
      await notifyNewFinancialYear({ beforeLead, savedLead, submittedPayload: req.body, actor: req.user });
      await notifyAdditionalLeadServices({
        beforeLead,
        afterLead: {
          ...(beforeLead || {}),
          ...savedLead,
          ...payload,
          serviceSelections: payload.serviceSelections || savedLead.serviceSelections || []
        },
        actor: req.user
      }).catch((error) => console.error('Additional lead service notification failed', error));
    }
    if (result.status >= 200 && result.status < 300 && savedLead) {
      // CCP may return legacy single-row arrays. The just-validated payload is the
      // authoritative source for the row collections saved in the CRM override.
      const authoritativeLead = {
        ...(beforeLead || {}),
        ...savedLead,
        ...payload,
        ...(Array.isArray(payload.serviceSelections) ? { serviceSelections: payload.serviceSelections } : {}),
        ...(Array.isArray(payload.assignments) ? { assignments: payload.assignments } : {})
      };
      await sendLeadClosureKickoffEmail({ beforeLead: beforeLead || {}, lead: authoritativeLead })
        .catch((error) => console.error('Lead closure kick-off email failed', error));
      const crmLead = await persistCcpLead({
        requestPayload: payload,
        responsePayload: { lead: authoritativeLead },
        fallbackId: req.params.id,
        user: req.user
      });
      return res.status(result.status).json({ ...result.payload, lead: authoritativeLead, crmRecordId: crmLead._id });
    }
    return res.status(result.status).json(result.payload);
  }
  catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.post('/leads/:id/royalty-claims', requireAuth, async (req, res) => {
  const ccpLead = await findCcpLeadById(req.params.id);
  if (!ccpLead) return res.status(404).json({ error: 'CCP lead not found.' });
  const [lead] = await applySavedLeadAssignments([ccpLead]);
  const eligibility = royaltyContributorEligibility(lead, req.user);
  if (eligibility.reason === 'same-user') {
    return res.status(400).json({ error: 'Royalty cannot be claimed when the original lead and added service were created by the same user.' });
  }
  if (!eligibility.eligible) {
    return res.status(400).json({ error: 'Claim Royalty is available only after two different users contribute service rows to the same lead.' });
  }
  const financialYear = String(req.body?.financialYear || '').trim();
  const result = await claimLeadRoyalty({ lead, claimant: req.user, financialYear });
  return res.status(result.skipped ? 200 : 201).json(result);
});
router.get('/clients', requireAuth, (req, res) => forward(req, res, 'GET', 'clients'));
router.get('/clients/sync-live/preview', requireAuth, requireRoles(ADMIN_ROLES), liveClientSyncController.preview);
router.post('/clients/sync-live/batch', requireAuth, requireRoles(ADMIN_ROLES), liveClientSyncController.batch);
router.post('/clients/sync-live/reconciliation', requireAuth, requireRoles(ADMIN_ROLES), liveClientSyncController.reconcile);
router.post('/clients', requireAuth, async (req, res) => {
  const body = sanitizeClient(req.body, req.user, ['admin', 'superadmin'].includes(req.user.role));
  const result = await requestCcp('POST', 'clients', body);
  if (result.status >= 200 && result.status < 300) {
    await trackManualClientSave({ payload: body, ccpPayload: result.payload, user: req.user }).catch(() => null);
    const crmClient = await persistCcpClient({ requestPayload: body, responsePayload: result.payload, user: req.user });
    return res.status(result.status).json({ ...result.payload, crmRecordId: crmClient._id });
  }
  return res.status(result.status).json(result.payload);
});
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
  if (result.status >= 200 && result.status < 300) {
    const savedClients = Array.isArray(result.payload?.clients)
      ? result.payload.clients
      : Array.isArray(result.payload?.data?.clients) ? result.payload.data.clients : [];
    const crmRecords = [];
    for (let index = 0; index < clients.length; index += 1) {
      const saved = savedClients[index];
      if (!saved) continue;
      const crmClient = await persistCcpClient({
        requestPayload: clients[index],
        responsePayload: { client: saved },
        user: req.user
      });
      crmRecords.push(String(crmClient._id));
    }
    return res.status(result.status).json({ ...result.payload, crmRecordIds: crmRecords });
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
router.put('/clients/:id', requireAuth, async (req, res) => {
  const body = sanitizeClient(req.body, req.user, ['admin', 'superadmin'].includes(req.user.role));
  const result = await requestCcp('PUT', `clients/${encodeURIComponent(req.params.id)}`, body);
  if (result.status >= 200 && result.status < 300) {
    await trackManualClientSave({ payload: body, ccpPayload: { ...result.payload, id: req.params.id }, user: req.user }).catch(() => null);
    const crmClient = await persistCcpClient({
      requestPayload: body,
      responsePayload: result.payload,
      fallbackId: req.params.id,
      user: req.user
    });
    return res.status(result.status).json({ ...result.payload, crmRecordId: crmClient._id });
  }
  return res.status(result.status).json(result.payload);
});

router._test = { LEAD_FIELDS, CLIENT_SECTIONS, pick, creatorIdentity, sanitizeLead, sanitizeClient, validatedLeadPayload, normalizeCompanyIdentity, ccpLeadList, leadOwnerName, royaltyContributorEligibility, enforceAssignmentPermissions };
module.exports = router;
