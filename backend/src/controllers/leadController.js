const Lead = require('../models/Lead');
const mongoose = require('mongoose');
const LeadActivity = require('../models/LeadActivity');
const Quotation = require('../models/Quotation');
const PendingApproval = require('../models/PendingApproval');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');
const { sendLeadClosureKickoffEmail } = require('../services/leadClosureKickoffEmail');
const { registerStaffOnboardingAssignments } = require('../services/staffOnboardingWorkflow');
const { notifyLeadAssignment } = require('../services/leadAssignmentNotifications');
const { notifyNewFinancialYear } = require('../services/leadFinancialYearNotifications');
const { notifyAdditionalLeadServices } = require('../services/leadServiceContributorNotifications');
const { claimLeadRoyalty } = require('../services/leadRoyaltyNotifications');
const { normalizeCompanyIdentity } = require('../services/crmRecordPersistence');
const { notifyNewProvisionalClosures, processExpiredProvisionalClosures } = require('../services/provisionalLeadClosureWorkflow');
const LeadDropdownOption = require('../models/LeadDropdownOption');
const { sendLeadIntroductionEmail } = require('../services/leadIntroductionEmail');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
const CalendarItem = require('../models/CalendarItem');
const { getVisibleUserScope, ownerFilter } = require('../utils/visibilityScope');
const { normalizeParent, inferPiboParent, validatePiboSelection } = require('../utils/piboCategories');
const { ADMIN_ROLES } = require('../constants/roles');

const REQUIRED_FIELDS = ['status', 'company', 'servicesOffered', 'addressLine1', 'state', 'city', 'pinCode'];
const LEAD_CODE_PREFIX = 'ATPL-LEAD-';

exports.listLeadDropdownOptions = async (_req, res) => {
  const rows = await LeadDropdownOption.find().sort({ field: 1, name: 1 }).lean();
  const options = rows.reduce((result, row) => {
    if (!result[row.field]) result[row.field] = [];
    result[row.field].push(row.name);
    return result;
  }, {});
  res.json({ ok: true, options });
};

exports.createLeadDropdownOption = async (req, res) => {
  const field = String(req.body.field || '').trim();
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  if (!LeadDropdownOption.ALLOWED_FIELDS.includes(field)) return res.status(400).json({ error: 'This dropdown cannot be customized.' });
  if (name.length < 2) return res.status(400).json({ error: 'Enter at least 2 characters.' });
  try {
    const option = await LeadDropdownOption.create({ field, name, normalizedName: name.toLowerCase(), createdBy: req.user._id });
    return res.status(201).json({ ok: true, option });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This option already exists.' });
    throw error;
  }
};

function usesDirectApplicantType(eprCategory) {
  const category = String(eprCategory || '').toLowerCase();
  return Boolean(category && !category.includes('plastic'));
}

function cleanBody(body) {
  const data = {};
  [
    'communicationMode',
    'communicationModeNote',
    'sourceLeadId',
    'status',
    'company',
    'industryType',
    'eprCategory',
    'piboParent',
    'piboCategoryParent',
    'piboCategory',
    'subApplicantType',
    'applicantType',
    'serviceSelections',
    'servicesOffered',
    'applicableService',
    'firstAnnualReturnYearApplicable',
    'addresses',
    'contacts',
    'assignments',
    'addressLine1',
    'addressLine2',
    'addressLine3',
    'landmark',
    'state',
    'city',
    'pinCode',
    'existingClient',
    'website',
    'salutation',
    'contactPerson',
    'designation',
    'emails',
    'emailsSentCount',
    'lastEmailSent',
    'mobileNo1',
    'mobileNo2',
    'whatsappNo',
    'linkedinUrl',
    'businessCardUrl',
    'referredBy',
    'source',
    'notes',
    'assignedTo',
    'assignedToText',
    'assignedStaff',
    'assignedStaffText',
    'assignedStaffEmail',
    'assignedBy',
    'importedCreatedBy',
    'createdByCrmUserId',
    'createdByName',
    'createdByEmail',
    'updatedBy',
    'closedBy',
    'closedByText',
    'closedByEmail',
    'closedAt',
    'leadDate',
    'nextFollowUpDate',
    'nextFollowUpTime',
    'followUpRemarks',
    'followUpPriority',
    'followUpFlag',
    'followUpHistory',
    'importedCreatedAt',
    'importedUpdatedAt',
    'workflowStatus',
    'bulkImported',
    'recordStatus',
    'complianceHealthReport'
  ].forEach((key) => {
    if (body[key] !== undefined) {
      const value = typeof body[key] === 'string' ? body[key].trim() : body[key];
      if (['assignedTo', 'assignedStaff', 'closedBy'].includes(key) && !value) return;
      if (key === 'complianceHealthReport') {
        if (value && typeof value === 'object' && !Array.isArray(value)) data[key] = value;
        return;
      }
      if (key === 'serviceSelections') {
        data[key] = Array.isArray(value) ? value.slice(0, 25).map((row) => ({
          industryType: String(row?.industryType || '').trim(),
          eprCategory: String(row?.eprCategory || '').trim(),
          applicantType: String(row?.applicantType || '').trim(),
          subApplicantType: String(row?.subApplicantType || row?.piboCategory || '').trim(),
          servicesOffered: String(row?.servicesOffered || '').trim(),
          applicableService: String(row?.applicableService || '').trim(),
          firstAnnualReturnYearApplicable: String(row?.firstAnnualReturnYearApplicable || '').trim(),
          nextFollowUpDate: String(row?.nextFollowUpDate || '').trim(),
          nextFollowUpTime: String(row?.nextFollowUpTime || '').trim(),
          followUpRemarks: String(row?.followUpRemarks || '').trim(),
          followUpPriority: String(row?.followUpPriority || 'Medium').trim(),
          followUpUpdatedAt: String(row?.followUpUpdatedAt || '').trim(),
          followUpFlag: String(row?.followUpFlag || '').trim(),
          followUpHistory: Array.isArray(row?.followUpHistory) ? row.followUpHistory.slice(0, 100) : [],
          createdByCrmUserId: String(row?.createdByCrmUserId || '').trim(),
          createdByName: String(row?.createdByName || '').trim(),
          createdByEmail: String(row?.createdByEmail || '').trim().toLowerCase()
        })) : [];
        return;
      }
      if (key === 'addresses') {
        data[key] = Array.isArray(value) ? value.slice(0, 25).map((row) => ({
          addressLine1: String(row?.addressLine1 || '').trim(),
          addressLine2: String(row?.addressLine2 || '').trim(),
          addressLine3: String(row?.addressLine3 || '').trim(),
          landmark: String(row?.landmark || '').trim(),
          state: String(row?.state || '').trim(),
          city: String(row?.city || '').trim(),
          pinCode: String(row?.pinCode || '').trim(),
          existingClient: row?.existingClient === 'Yes' ? 'Yes' : 'No',
          website: String(row?.website || '').trim()
        })) : [];
        return;
      }
      if (key === 'contacts') {
        data[key] = Array.isArray(value) ? value.slice(0, 25).map((row) => ({
          salutation: String(row?.salutation || '').trim(),
          contactPerson: String(row?.contactPerson || '').trim(),
          designation: String(row?.designation || '').trim(),
          emails: String(row?.emails || '').trim(),
          mobileNo1: String(row?.mobileNo1 || '').replace(/\D/g, '').slice(0, 10),
          mobileNo2: String(row?.mobileNo2 || '').replace(/\D/g, '').slice(0, 10),
          whatsappNo: String(row?.whatsappNo || '').replace(/\D/g, '').slice(0, 10),
          linkedinUrl: String(row?.linkedinUrl || '').trim(),
          referredBy: String(row?.referredBy || '').trim(),
          source: String(row?.source || '').trim(),
          businessCardUrl: String(row?.businessCardUrl || '').trim()
        })) : [];
        return;
      }
      if (key === 'assignments') {
        data[key] = Array.isArray(value) ? value.slice(0, 25).map((row) => ({
          assignedTo: String(row?.assignedTo || '').trim(),
          assignedToText: String(row?.assignedToText || '').trim(),
          assignedToEmail: String(row?.assignedToEmail || '').trim(),
          closedBy: String(row?.closedBy || '').trim(),
          closedByText: String(row?.closedByText || '').trim(),
          closedByEmail: String(row?.closedByEmail || '').trim(),
          assignedStaff: String(row?.assignedStaff || '').trim(),
          assignedStaffText: String(row?.assignedStaffText || '').trim(),
          assignedStaffEmail: String(row?.assignedStaffEmail || '').trim(),
          assignedBy: String(row?.assignedBy || '').trim(),
          poStatus: ['received', 'provisional'].includes(String(row?.poStatus || '')) ? String(row.poStatus) : '',
          poYearRows: Array.isArray(row?.poYearRows) ? row.poYearRows.slice(0, 25).map((po) => ({
            fy: String(po?.fy || '').trim(), poNumber: String(po?.poNumber || '').trim(),
            poFileUrl: String(po?.poFileUrl || '').trim(), poFileName: String(po?.poFileName || '').trim(),
            services: Array.isArray(po?.services) ? po.services.map((service) => String(service || '').trim()).filter(Boolean) : []
          })) : [],
          closureApprovalProofUrl: String(row?.closureApprovalProofUrl || '').trim(),
          closureApprovalProofName: String(row?.closureApprovalProofName || '').trim(),
          provisionalCloseExpiresAt: String(row?.provisionalCloseExpiresAt || '').trim(),
          kickoffEmailConsent: row?.kickoffEmailConsent === 'yes' ? 'yes' : row?.kickoffEmailConsent === 'no' ? 'no' : ''
        })) : [];
        return;
      }
      data[key] = key === 'emailsSentCount' ? Number(value) || 0 : value;
      if (key === 'followUpHistory') data[key] = Array.isArray(value) ? value : [];
    }
  });
  const primaryService = Array.isArray(data.serviceSelections) ? data.serviceSelections[0] : null;
  if (primaryService) {
    data.industryType = primaryService.industryType || data.industryType;
    data.eprCategory = primaryService.eprCategory || data.eprCategory;
    data.applicantType = primaryService.applicantType || data.applicantType;
    data.subApplicantType = primaryService.subApplicantType || data.subApplicantType || data.piboCategory;
    data.servicesOffered = primaryService.servicesOffered || data.servicesOffered;
    data.firstAnnualReturnYearApplicable = primaryService.firstAnnualReturnYearApplicable || data.firstAnnualReturnYearApplicable;
  }
  data.subApplicantType = String(data.subApplicantType || data.piboCategory || '').trim();
  data.piboParent = normalizeParent(data.piboParent || data.piboCategoryParent) || inferPiboParent(data.subApplicantType) || undefined;
  if (/\btyre\b/i.test(String(data.eprCategory || '')) && ['Producer', 'Recycler', 'Retreader'].includes(data.applicantType)) {
    const compatibility = data.applicantType === 'Producer'
      ? { piboParent: 'PIBO', subApplicantType: 'Producer' }
      : data.applicantType === 'Recycler'
        ? { piboParent: 'PWP', subApplicantType: 'Recycler' }
        : { piboParent: 'PWP', subApplicantType: 'PWP' };
    Object.assign(data, compatibility);
  }
  delete data.piboCategoryParent;
  delete data.piboCategory;
  return data;
}

function validateSubmittedLead(data) {
  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length) return `Missing required fields: ${missing.join(', ')}`;
  if (!usesDirectApplicantType(data.eprCategory) && !data.subApplicantType) return 'Sub Applicant Type is required';
  const addresses = Array.isArray(data.addresses) && data.addresses.length ? data.addresses : [data];
  if (addresses.some((row) => !/^\d{6}$/.test(String(row?.pinCode || '')))) return 'Every PIN code must contain exactly 6 digits';
  const contacts = Array.isArray(data.contacts) && data.contacts.length ? data.contacts : [data];
  if (contacts.some((row) => !row.salutation || !row.contactPerson || !row.designation || !row.emails || !row.mobileNo1 || !row.referredBy || !row.source)) return 'All contact fields except Mobile No. 2 and Business Card are required';
  if (contacts.some((row) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.emails || '')))) return 'Every contact must have a valid email address';
  if (contacts.some((row) => !/^\d{10}$/.test(String(row.mobileNo1 || '')))) return 'Every primary mobile number must contain exactly 10 digits';
  if (contacts.some((row) => row.whatsappNo && !/^\d{10}$/.test(String(row.whatsappNo)))) return 'Every WhatsApp number must contain exactly 10 digits';
  if (contacts.some((row) => row.linkedinUrl && !/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\//i.test(String(row.linkedinUrl)))) return 'Every LinkedIn value must be a valid linkedin.com URL';
  return '';
}

const SERVICE_DUPLICATE_FIELDS = ['industryType', 'eprCategory', 'applicantType', 'subApplicantType', 'servicesOffered', 'firstAnnualReturnYearApplicable'];

function validateDuplicateServiceSelections(data = {}) {
  const rows = Array.isArray(data.serviceSelections) ? data.serviceSelections : [];
  const seen = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const complete = SERVICE_DUPLICATE_FIELDS.every((field) => field === 'subApplicantType' && usesDirectApplicantType(row.eprCategory)
      ? true
      : Boolean(String(row[field] || '').trim()));
    if (!complete) continue;
    const identity = SERVICE_DUPLICATE_FIELDS.map((field) => String(row[field] || '').trim().toLowerCase()).join('|');
    if (seen.has(identity)) return `Service row ${index + 1} duplicates row ${seen.get(identity) + 1}. Change at least one service field.`;
    seen.set(identity, index);
  }
  return '';
}

function validateClosureAssignments(data = {}) {
  const rows = Array.isArray(data.assignments) ? data.assignments : [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    if (!row.closedBy) continue;
    if (row.poStatus === 'received') {
      const poRows = Array.isArray(row.poYearRows) ? row.poYearRows : [];
      if (!poRows.length || poRows.some((po) => !po.fy || !po.poNumber || !po.poFileUrl || !Array.isArray(po.services) || !po.services.length)) return `Assignment row ${index + 1}: complete every PO detail before closing.`;
    } else if (row.poStatus === 'provisional') {
      if (!row.closureApprovalProofUrl || !row.provisionalCloseExpiresAt) return `Assignment row ${index + 1}: Super Admin approval proof is required for closure without PO.`;
    } else return `Assignment row ${index + 1}: choose whether the PO was received before closing.`;
  }
  return '';
}

async function getNextLeadCode() {
  const latest = await Lead.findOne({ leadCode: { $exists: true, $ne: '' } })
    .sort({ leadCode: -1 })
    .select('leadCode')
    .lean();
  const latestNumber = Number.parseInt(String(latest?.leadCode || '').replace(LEAD_CODE_PREFIX, ''), 10) || 0;
  return `${LEAD_CODE_PREFIX}${String(latestNumber + 1).padStart(4, '0')}`;
}

async function createLeadRecord(rawBody, userId) {
  const data = cleanBody(rawBody);
  const duplicateServiceError = validateDuplicateServiceSelections(data);
  if (duplicateServiceError) {
    const validationError = new Error(duplicateServiceError);
    validationError.statusCode = 409;
    throw validationError;
  }
  const closureError = validateClosureAssignments(data);
  if (closureError) { const validationError = new Error(closureError); validationError.statusCode = 400; throw validationError; }
  data.companyIdentity = normalizeCompanyIdentity(data.company);
  data.workflowStatus = data.workflowStatus === 'submitted' ? 'submitted' : 'draft';

  if ((!usesDirectApplicantType(data.eprCategory) && data.workflowStatus === 'submitted') || data.piboParent || data.subApplicantType) {
    const selection = await validatePiboSelection({ parent: data.piboParent, child: data.subApplicantType, required: true });
    data.piboParent = selection.piboParent;
    data.subApplicantType = selection.piboCategory;
  }

  if (data.workflowStatus === 'submitted') {
    const error = validateSubmittedLead(data);
    if (error) {
      const validationError = new Error(error);
      validationError.statusCode = 400;
      throw validationError;
    }
  }

  return Lead.create({ ...data, leadCode: await getNextLeadCode(), createdBy: userId });
}

function royaltyIdentityTokens(...values) {
  const identity = (value) => String(value || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ');
  return [...new Set(values.flatMap((value) => value && typeof value === 'object'
    ? [value._id, value.id, value.crmUserId, value.userId, value.email, value.name]
    : [value]).filter(Boolean).map(identity).filter(Boolean))];
}

function royaltyContributorEligibility(lead = {}, claimant = {}) {
  const originalIds = royaltyIdentityTokens(lead.createdBy, lead.createdByCrmUserId, lead.createdByEmail, lead.createdByName, lead.importedCreatedBy);
  const claimantIds = royaltyIdentityTokens(claimant._id, claimant.id, claimant.crmUserId, claimant.userId, claimant.email, claimant.name);
  if (originalIds.some((value) => claimantIds.includes(value))) {
    return { eligible: false, reason: 'same-user' };
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
    reason: distinctContributors.length < 2 ? 'insufficient-contributors' : claimantContributed ? '' : 'claimant-not-contributor'
  };
}

async function findDuplicateCompanyRecord(company, excludeId = '') {
  const identity = normalizeCompanyIdentity(company);
  if (!identity) return null;
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await Lead.find({ $or: [
    { companyIdentity: identity },
    { company: { $regex: `^\\s*${escaped}`, $options: 'i' } }
  ] }).select('_id company leadCode importedCreatedBy createdBy').populate('createdBy', 'name email').lean();
  return rows.find((lead) => String(lead._id) !== String(excludeId || '') && normalizeCompanyIdentity(lead.company) === identity) || null;
}

function bulkServiceRow(source = {}, user = {}) {
  return {
    industryType: String(source.industryType || '').trim(),
    eprCategory: String(source.eprCategory || '').trim(),
    applicantType: String(source.applicantType || source.piboParent || '').trim(),
    subApplicantType: String(source.subApplicantType || source.piboCategory || '').trim(),
    servicesOffered: String(source.servicesOffered || '').trim(),
    applicableService: String(source.applicableService || '').trim(),
    firstAnnualReturnYearApplicable: String(source.firstAnnualReturnYearApplicable || '').trim(),
    createdByCrmUserId: String(source.createdByCrmUserId || user?._id || user?.id || '').trim(),
    createdByName: String(source.createdByName || source.importedCreatedBy || user?.name || user?.email || '').trim(),
    createdByEmail: String(source.createdByEmail || user?.email || '').trim().toLowerCase()
  };
}

function changedFollowUpIndexes(beforeLead = {}, data = {}) {
  if (!Array.isArray(data.serviceSelections)) return [];
  const beforeRows = Array.isArray(beforeLead.serviceSelections) ? beforeLead.serviceSelections : [];
  return data.serviceSelections.map((row, index) => {
    const before = beforeRows[index] || {};
    const currentKey = [row?.nextFollowUpDate, row?.nextFollowUpTime, row?.followUpRemarks].map((value) => String(value || '').trim()).join('|');
    const beforeKey = [before?.nextFollowUpDate, before?.nextFollowUpTime, before?.followUpRemarks].map((value) => String(value || '').trim()).join('|');
    return currentKey && currentKey !== beforeKey ? index : -1;
  }).filter((index) => index >= 0);
}

function normalizeBulkUserIdentity(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildBulkUserIndex(users = []) {
  const index = new Map();
  users.forEach((user = {}) => {
    const name = String(user.name || '').trim().replace(/\s+/g, ' ');
    const email = String(user.email || '').trim().toLowerCase();
    const tokens = [user._id, user.id, user.crmUserId, name, email, name && email ? `${name} (${email})` : '']
      .map(normalizeBulkUserIdentity).filter(Boolean);
    tokens.forEach((token) => {
      if (!index.has(token)) index.set(token, user);
      else if (String(index.get(token)?._id || '') !== String(user._id || '')) index.set(token, null);
    });
  });
  return index;
}

function resolveBulkCreator(userIndex, value) {
  return userIndex.get(normalizeBulkUserIdentity(value)) || null;
}

function hasBulkService(row = {}) {
  return ['industryType', 'eprCategory', 'applicantType', 'subApplicantType', 'servicesOffered', 'applicableService', 'firstAnnualReturnYearApplicable']
    .some((key) => String(row[key] || '').trim());
}

function bulkServiceIdentity(row = {}) {
  return ['industryType', 'eprCategory', 'applicantType', 'subApplicantType', 'servicesOffered', 'applicableService', 'firstAnnualReturnYearApplicable']
    .map((key) => String(row[key] || '').trim().toLowerCase()).join('|');
}

function normalizeLegacyBulkServices(lead = {}) {
  const saved = (Array.isArray(lead.serviceSelections) ? lead.serviceSelections : []).map((row) => bulkServiceRow(row));
  const topLevel = bulkServiceRow(lead);
  if (hasBulkService(topLevel) && !saved.some((row) => bulkServiceIdentity(row) === bulkServiceIdentity(topLevel))) saved.unshift(topLevel);
  return saved;
}

function bulkAssignmentRow(source = {}) {
  return {
    assignedTo: String(source.assignedTo?._id || source.assignedTo || '').trim(),
    assignedToText: String(source.assignedToText || '').trim(),
    assignedToEmail: String(source.assignedToEmail || '').trim().toLowerCase(),
    assignedStaff: String(source.assignedStaff?._id || source.assignedStaff || '').trim(),
    assignedStaffText: String(source.assignedStaffText || '').trim(),
    assignedStaffEmail: String(source.assignedStaffEmail || '').trim().toLowerCase(),
    closedBy: String(source.closedBy?._id || source.closedBy || '').trim(),
    closedByText: String(source.closedByText || '').trim(),
    closedByEmail: String(source.closedByEmail || '').trim().toLowerCase(),
    assignedBy: String(source.assignedBy || '').trim()
  };
}

function alignBulkAssignments(lead = {}, serviceCount = 0) {
  const existing = (Array.isArray(lead.assignments) ? lead.assignments : []).map(bulkAssignmentRow);
  const topLevel = bulkAssignmentRow(lead);
  if (existing.length < serviceCount && Object.values(topLevel).some(Boolean)) existing.unshift(topLevel);
  while (existing.length < serviceCount) existing.push({ ...topLevel });
  return existing.slice(0, serviceCount);
}

function bulkAddressRow(source = {}) {
  return {
    addressLine1: String(source.addressLine1 || '').trim(), addressLine2: String(source.addressLine2 || '').trim(),
    addressLine3: String(source.addressLine3 || '').trim(), landmark: String(source.landmark || '').trim(),
    state: String(source.state || '').trim(), city: String(source.city || '').trim(), pinCode: String(source.pinCode || '').trim(),
    existingClient: source.existingClient === 'Yes' ? 'Yes' : 'No', website: String(source.website || '').trim()
  };
}

function bulkContactRow(source = {}) {
  return {
    salutation: String(source.salutation || '').trim(), contactPerson: String(source.contactPerson || '').trim(),
    designation: String(source.designation || '').trim(), emails: String(source.emails || '').trim(),
    mobileNo1: String(source.mobileNo1 || '').replace(/\D/g, '').slice(0, 10), mobileNo2: String(source.mobileNo2 || '').replace(/\D/g, '').slice(0, 10),
    whatsappNo: String(source.whatsappNo || '').replace(/\D/g, '').slice(0, 10), linkedinUrl: String(source.linkedinUrl || '').trim(),
    referredBy: String(source.referredBy || '').trim(), source: String(source.source || '').trim(), businessCardUrl: String(source.businessCardUrl || '').trim()
  };
}

function buildBulkCreateData(data, user = {}) {
  const service = bulkServiceRow(data, user);
  const assignment = bulkAssignmentRow(data);
  return {
    ...data,
    serviceSelections: [service],
    assignments: [assignment],
    addresses: Array.isArray(data.addresses) && data.addresses.length ? data.addresses : [bulkAddressRow(data)],
    contacts: Array.isArray(data.contacts) && data.contacts.length ? data.contacts : [bulkContactRow(data)],
    workflowStatus: 'draft'
  };
}

function buildBulkMergeData(existing = {}, incoming = {}, user = {}) {
  const services = normalizeLegacyBulkServices(existing);
  const assignments = alignBulkAssignments(existing, services.length);
  const addedService = bulkServiceRow(incoming, user);
  services.push(addedService);
  assignments.push(bulkAssignmentRow(incoming));
  const primary = services[0] || {};
  const fill = (key) => existing[key] || incoming[key];
  return {
    serviceSelections: services,
    assignments: assignments,
    industryType: primary.industryType || existing.industryType || '', eprCategory: primary.eprCategory || existing.eprCategory || '',
    applicantType: primary.applicantType || existing.applicantType || '', subApplicantType: primary.subApplicantType || existing.subApplicantType || existing.piboCategory || '',
    servicesOffered: primary.servicesOffered || existing.servicesOffered || '', firstAnnualReturnYearApplicable: primary.firstAnnualReturnYearApplicable || existing.firstAnnualReturnYearApplicable || '',
    addresses: Array.isArray(existing.addresses) && existing.addresses.length ? existing.addresses : [bulkAddressRow(incoming)],
    contacts: Array.isArray(existing.contacts) && existing.contacts.length ? existing.contacts : [bulkContactRow(incoming)],
    communicationMode: fill('communicationMode'), status: fill('status'), addressLine1: fill('addressLine1'), addressLine2: fill('addressLine2'),
    addressLine3: fill('addressLine3'), landmark: fill('landmark'), state: fill('state'), city: fill('city'), pinCode: fill('pinCode'),
    existingClient: fill('existingClient'), website: fill('website'), salutation: fill('salutation'), contactPerson: fill('contactPerson'),
    designation: fill('designation'), emails: fill('emails'), mobileNo1: fill('mobileNo1'), mobileNo2: fill('mobileNo2'), whatsappNo: fill('whatsappNo'), linkedinUrl: fill('linkedinUrl'),
    businessCardUrl: fill('businessCardUrl'), referredBy: fill('referredBy'), source: fill('source'), notes: fill('notes'),
    workflowStatus: 'draft', bulkImported: true
  };
}

exports.searchCompanies = async (req, res) => {
  const query = String(req.query.q || req.query.company || '').trim();
  const identity = normalizeCompanyIdentity(query);

  if (identity.length < 2) {
    return res.json({ ok: true, leads: [] });
  }

  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leads = await Lead.find({ $or: [
    { companyIdentity: { $regex: escaped, $options: 'i' } },
    { company: { $regex: escaped, $options: 'i' } }
  ] })
    .populate('assignedTo', 'name email avatarUrl role')
    .populate('closedBy', 'name email avatarUrl role')
    .populate('createdBy', 'name email')
    .sort({ company: 1, createdAt: -1 })
    .limit(10)
    .lean();

  res.json({ ok: true, leads: leads.filter((lead) => normalizeCompanyIdentity(lead.company).includes(identity)) });
};

exports.listLeads = async (req, res) => {
  await processExpiredProvisionalClosures();
  const scope = await getVisibleUserScope(req.user);
  const leads = await Lead.find(ownerFilter(scope, 'createdBy', 'assignedTo', [
    'assignedToText',
    'assignedToEmail',
    'assignedStaffText',
    'assignedStaffEmail',
    'assignments.assignedTo',
    'assignments.assignedToText',
    'assignments.assignedToEmail',
    'assignments.assignedStaff',
    'assignments.assignedStaffText',
    'assignments.assignedStaffEmail',
    'serviceSelections.createdByCrmUserId',
    'serviceSelections.createdByName',
    'serviceSelections.createdByEmail'
  ]))
    .populate('assignedTo', 'name email avatarUrl role')
    .populate('closedBy', 'name email avatarUrl role')
    .sort({ leadCode: 1, createdAt: 1 });
  res.json({ ok: true, leads });
};

exports.createLead = async (req, res) => {
  try {
    const duplicate = await findDuplicateCompanyRecord(req.body?.company);
    if (duplicate) {
      const ownerName = duplicate.importedCreatedBy || duplicate.createdBy?.name || duplicate.createdBy?.email || 'another CRM user';
      return res.status(409).json({
        error: `This lead has already been generated by ${ownerName}. You cannot create or update this lead.`,
        code: 'DUPLICATE_LEAD_COMPANY',
        duplicate: {
          id: String(duplicate._id || ''),
          company: duplicate.company || '',
          ownerName,
          leadCode: duplicate.leadCode || ''
        }
      });
    }
    const lead = await createLeadRecord(req.body, req.user?._id);
    await LeadActivity.create({ lead: lead._id, type: 'lead_created', title: 'Lead created', description: `Lead created for ${lead.company || lead.leadCode}`, actor: req.user?._id });
    const managerId = String(req.body?.assignedToCrmUserId || req.body?.assignedTo || lead.assignedTo || '').trim();
    if (managerId) {
      await notifyLeadAssignment({ lead: lead.toObject(), managerId, assignedBy: req.user }).catch((error) => console.error('Lead assignment notification failed', error));
    }
    if (lead.workflowStatus === 'submitted' && !lead.introductionEmailSentAt) {
      // Claim this one-time email before sending. Retries and later lead edits must
      // never produce a duplicate introduction email for the same lead.
      lead.introductionEmailSentAt = new Date();
      await lead.save();
      await sendLeadIntroductionEmail({ lead: lead.toObject(), creator: req.user })
        .catch((error) => console.error('Lead introduction email failed', error));
    }
    res.status(201).json({ ok: true, lead });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to save lead' });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const beforeLead = lead.toObject();

    if (req.body?.company) {
      const duplicate = await findDuplicateCompanyRecord(req.body.company, req.params.id);
      if (duplicate) {
        const ownerName = duplicate.importedCreatedBy || duplicate.createdBy?.name || duplicate.createdBy?.email || 'another CRM user';
        return res.status(409).json({
          error: `This lead has already been generated by ${ownerName}. You cannot create or update this lead.`,
          code: 'DUPLICATE_LEAD_COMPANY',
          duplicate: {
            id: String(duplicate._id || ''),
            company: duplicate.company || '',
            ownerName,
            leadCode: duplicate.leadCode || ''
          }
        });
      }
    }

    const data = cleanBody(req.body);
    const followUpChangedIndexes = changedFollowUpIndexes(beforeLead, data);
    if (followUpChangedIndexes.length) {
      data.followUpFlag = 'GREEN';
      data.serviceSelections = data.serviceSelections.map((row, index) => followUpChangedIndexes.includes(index) ? { ...row, followUpFlag: 'GREEN' } : row);
    }
    const duplicateServiceError = validateDuplicateServiceSelections({ ...lead.toObject(), ...data });
    if (duplicateServiceError) return res.status(409).json({ error: duplicateServiceError, code: 'DUPLICATE_SERVICE_COMBINATION' });
    const closureError = validateClosureAssignments({ ...lead.toObject(), ...data });
    if (closureError) return res.status(400).json({ error: closureError, code: 'INVALID_LEAD_CLOSURE' });
    if (Object.prototype.hasOwnProperty.call(data, 'company')) {
      data.companyIdentity = normalizeCompanyIdentity(data.company);
    }
    data.workflowStatus = data.workflowStatus === 'submitted' ? 'submitted' : (data.workflowStatus || lead.workflowStatus || 'draft');

    if (data.workflowStatus === 'submitted') {
      const error = validateSubmittedLead({ ...lead.toObject(), ...data });
      if (error) return res.status(400).json({ error });
    }

    if ((!usesDirectApplicantType(data.eprCategory) && data.workflowStatus === 'submitted') || data.piboParent || data.subApplicantType) {
      const current = lead.toObject();
      const selection = await validatePiboSelection({
        parent: data.piboParent || current.piboParent || current.piboCategoryParent,
        child: data.subApplicantType || current.subApplicantType || current.piboCategory,
        required: true
      });
      data.piboParent = selection.piboParent;
      data.subApplicantType = selection.piboCategory;
    }

    Object.assign(lead, data);
    if (Object.prototype.hasOwnProperty.call(data, 'subApplicantType') || Array.isArray(data.serviceSelections)) {
      lead.piboCategory = undefined;
    }
    lead.updatedBy = req.user?.name || req.user?.email || String(req.user?._id || '');
    if (data.closedBy && !lead.closedAt) lead.closedAt = new Date();
    await lead.save();
    if (Object.prototype.hasOwnProperty.call(data, 'subApplicantType') || Array.isArray(data.serviceSelections)) {
      await Lead.collection.updateOne({ _id: lead._id }, { $unset: { piboCategory: '' } });
    }
    if (followUpChangedIndexes.length) {
      const completedAt = new Date().toISOString();
      await CalendarItem.updateMany({
        leadId: String(lead._id), type: 'followup', status: { $ne: 'completed' },
        'metadata.serviceIndex': { $in: followUpChangedIndexes }
      }, {
        $set: { status: 'completed', completedAt, completionRemarks: 'Follow-up updated; red flag reset to green.' },
        $push: { completionHistory: { at: completedAt, by: req.user?.name || req.user?.email || 'CRM User', remarks: 'Follow-up updated; red flag reset to green.' } }
      });
    }
    await notifyNewProvisionalClosures({ beforeLead, afterLead: lead.toObject(), actor: req.user })
      .catch((error) => console.error('Provisional lead closure email failed', error));
    await sendLeadClosureKickoffEmail({ beforeLead, lead: lead.toObject() })
      .catch((error) => console.error('Lead closure kick-off email failed', error));
    if (Array.isArray(data.assignments)) {
      await registerStaffOnboardingAssignments({
        lead: lead.toObject(),
        manager: req.user
      }).catch((error) => console.error('Staff onboarding assignment notification failed', error));
    }
    const managerId = String(req.body?.assignedToCrmUserId || req.body?.assignedTo || lead.assignedTo || '').trim();
    if (managerId) {
      await notifyLeadAssignment({ lead: lead.toObject(), managerId, assignedBy: req.user }).catch((error) => console.error('Lead assignment notification failed', error));
    }
    if (req.body?.addServicesMode) {
      await notifyNewFinancialYear({ beforeLead, savedLead: lead.toObject(), submittedPayload: req.body, actor: req.user }).catch((error) => console.error('Financial year notification failed', error));
      await notifyAdditionalLeadServices({
        beforeLead,
        afterLead: lead.toObject(),
        actor: req.user
      }).catch((error) => console.error('Additional lead service notification failed', error));
    }
    const changedFields = Object.keys(data).filter((key) => key !== 'followUpHistory');
    await LeadActivity.create({ lead: lead._id, type: 'lead_updated', title: 'Lead updated', description: changedFields.length ? `Updated ${changedFields.join(', ')}` : 'Lead details updated', actor: req.user?._id, metadata: { changedFields } });
    res.json({ ok: true, lead });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to update lead' });
  }
};

exports.recordIntroductionEmail = async (req, res) => {
  const lead = mongoose.isValidObjectId(req.params.id) ? await Lead.findById(req.params.id) : await Lead.findOne({ sourceLeadId: req.params.id });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const recipient = String(req.body.recipient || lead.emails || '').trim();
  await LeadActivity.create({ lead: lead._id, type: 'email_sent', title: 'Introduction email opened', description: recipient ? `Introduction email prepared for ${recipient}` : 'Introduction email action opened', actor: req.user?._id, metadata: { recipient } });
  res.status(201).json({ ok: true });
};

exports.getLeadHistory = async (req, res) => {
  const lookup = [{ sourceLeadId: req.params.id }];
  if (req.query.leadCode) lookup.push({ leadCode: String(req.query.leadCode).trim() });
  if (mongoose.isValidObjectId(req.params.id)) lookup.push({ _id: req.params.id });
  const storedLead = await Lead.findOne({ $or: lookup }).populate('createdBy', 'name email').lean();
  const lead = storedLead || { leadCode: String(req.query.leadCode || '').trim(), company: String(req.query.company || '').trim(), sourceLeadId: req.params.id };
  const ids = [lead._id, lead.sourceLeadId, req.params.id].filter(Boolean).map(String);
  const company = String(lead.company || req.query.company || '').trim();
  const quotationMatches = [{ leadId: { $in: ids } }];
  if (lead.leadCode) quotationMatches.push({ leadCode: lead.leadCode });
  if (company) quotationMatches.push({ 'leadDetails.companyName': company });
  const quotations = await Quotation.find({ $or: quotationMatches }).populate('createdBy', 'name email').lean();
  const quotationIds = quotations.map((item) => String(item._id));
  const calendarMatches = [];
  if (lead.leadCode) calendarMatches.push({ leadNumber: lead.leadCode });
  if (company) calendarMatches.push({ leadCompanyName: company });
  const [activities, approvals, calendarItems] = await Promise.all([
    lead._id ? LeadActivity.find({ lead: lead._id }).populate('actor', 'name email').lean() : Promise.resolve([]),
    PendingApproval.find({ type: 'quotation', sourceClientId: { $in: quotationIds } }).populate('actionBy', 'name email').lean(),
    calendarMatches.length ? CalendarItem.find({ $or: calendarMatches }).lean() : Promise.resolve([])
  ]);
  const events = activities.map((item) => ({ id: item._id, type: item.type, title: item.title, description: item.description, actor: item.actor?.name || item.actor?.email || item.actorName || 'CRM User', at: item.createdAt, metadata: item.metadata }));
  if (!activities.some((item) => item.type === 'lead_created') && (lead.createdAt || lead.importedCreatedAt)) events.push({ id: `created-${lead._id || req.params.id}`, type: 'lead_created', title: 'Lead created', description: `Lead ${lead.leadCode || ''} created for ${company}`, actor: lead.createdBy?.name || lead.createdBy?.email || lead.importedCreatedBy || 'Imported user', at: lead.createdAt || lead.importedCreatedAt });
  quotations.forEach((item) => events.push({ id: `quote-${item._id}`, type: 'quotation_created', title: 'Quotation created', description: `${item.quotationNumber || 'Quotation'} added with ${(item.items || []).length} item(s)`, actor: item.createdBy?.name || item.createdBy?.email || 'CRM User', at: item.createdAt, metadata: { quotationNumber: item.quotationNumber, status: item.status } }));
  approvals.forEach((item) => events.push({ id: `approval-${item._id}`, type: item.approvalStatus === 'APPROVED' ? 'quotation_approved' : item.approvalStatus === 'REJECTED' ? 'quotation_rejected' : 'approval_pending', title: item.approvalStatus === 'APPROVED' ? 'Quotation approved' : item.approvalStatus === 'REJECTED' ? 'Quotation rejected' : 'Quotation sent for approval', description: `${item.uniqueId || 'Quotation'} • ${item.remarks || item.approvalStatus}`, actor: item.actionBy?.name || item.actionBy?.email || item.createdByName || 'CRM User', at: item.actionAt || item.createdAt }));
  calendarItems.forEach((item) => {
    events.push({ id: `calendar-${item._id}`, type: item.type === 'followup' ? 'follow_up' : 'todo', title: item.type === 'followup' ? 'Follow-up scheduled' : 'Todo created', description: `${item.title}${item.scheduledDate ? ` • ${item.scheduledDate}${item.scheduledTime ? ` ${item.scheduledTime}` : ''}` : ''}`, actor: item.createdBy || item.assignedToName || 'CRM User', at: item.createdAt, metadata: { status: item.status, priority: item.priority } });
    (item.completionHistory || []).forEach((entry, index) => events.push({ id: `complete-${item._id}-${index}`, type: 'todo_completed', title: `${item.type === 'followup' ? 'Follow-up' : 'Todo'} completed`, description: entry.remarks || item.completionRemarks || item.title, actor: entry.by || item.assignedToName || 'CRM User', at: entry.at || item.completedAt || item.updatedAt }));
  });
  (lead.followUpHistory || []).forEach((item, index) => events.push({ id: `followup-${index}`, type: 'follow_up', title: 'Lead follow-up updated', description: item.remarks || item.followUpRemarks || 'Follow-up activity', actor: item.updatedBy || item.createdBy || 'CRM User', at: item.updatedAt || item.createdAt || item.date || lead.updatedAt }));
  events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  res.json({ ok: true, lead: { leadCode: lead.leadCode, company }, events, summary: { total: events.length, quotations: quotations.length, followUps: events.filter((item) => item.type === 'follow_up').length, todos: events.filter((item) => item.type.startsWith('todo')).length } });
};

exports.bulkCreateLeads = async (req, res) => {
  const rows = Array.isArray(req.body.leads) ? req.body.leads : [];
  if (!rows.length) return res.status(400).json({ error: 'No leads provided' });

  const leads = [];
  const failures = [];
  let created = 0;
  let updated = 0;
  const staff = await User.find({ isActive: { $ne: false } }).select('_id crmUserId name email').lean();
  const staffByName = new Map(staff.map((user) => [String(user.name || '').trim().replace(/\s+/g, ' ').toLowerCase(), user]));
  const staffByIdentity = buildBulkUserIndex(staff);

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const data = cleanBody(rows[index]);
      data.workflowStatus = 'draft';
      data.bulkImported = true;
      data.companyIdentity = normalizeCompanyIdentity(data.company);
      if (!data.companyIdentity) throw new Error('Company is required');
      if (data.pinCode && !/^\d{6}$/.test(String(data.pinCode))) throw new Error('PIN must contain exactly 6 digits');

      const assignedName = String(data.assignedToText || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const matchedStaff = assignedName ? staffByName.get(assignedName) : null;
      if (matchedStaff) {
        data.assignedTo = matchedStaff._id;
        data.assignedToText = matchedStaff.name;
        data.assignedToEmail = matchedStaff.email || '';
      }

      const requestedCreator = String(data.importedCreatedBy || '').trim();
      const creator = requestedCreator ? resolveBulkCreator(staffByIdentity, requestedCreator) : req.user;
      if (requestedCreator && !creator) {
        throw new Error(`Created By user "${requestedCreator}" was not found or is not unique. Use the exact active CRM user name, email, or CRM User ID.`);
      }
      data.createdByCrmUserId = String(creator?._id || creator?.id || '').trim();
      data.createdByName = String(creator?.name || creator?.email || '').trim();
      data.createdByEmail = String(creator?.email || '').trim().toLowerCase();
      data.importedCreatedBy = data.createdByName;

      let lead = await Lead.findOne({ companyIdentity: data.companyIdentity });
      if (!lead) {
        const escapedCompany = String(data.company || '').trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const candidates = escapedCompany ? await Lead.find({ company: { $regex: `^\\s*${escapedCompany}`, $options: 'i' } }).limit(100) : [];
        lead = candidates.find((candidate) => normalizeCompanyIdentity(candidate.company) === data.companyIdentity) || null;
      }

      if (lead) {
        lead.set(buildBulkMergeData(lead.toObject(), data, creator));
        lead.companyIdentity = data.companyIdentity;
        await lead.save();
        updated += 1;
      } else {
        lead = await createLeadRecord(buildBulkCreateData(data, creator), creator?._id || req.user?._id);
        created += 1;
      }
      leads.push(lead);
    } catch (err) {
      failures.push({
        row: index + 1,
        error: err.message || 'Unable to save lead'
      });
    }
  }

  res.status(failures.length && !leads.length ? 400 : 201).json({
    ok: failures.length === 0,
    imported: leads.length,
    created,
    updated,
    failed: failures.length,
    leads,
    failures
  });
};

exports.claimLeadRoyalty = async (req, res) => {
  const lookup = [{ sourceLeadId: req.params.id }];
  if (mongoose.isValidObjectId(req.params.id)) lookup.push({ _id: req.params.id });
  const lead = await Lead.findOne({ $or: lookup }).populate('createdBy', 'name email').lean();
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const eligibility = royaltyContributorEligibility(lead, req.user);
  if (eligibility.reason === 'same-user') {
    return res.status(400).json({ error: 'Royalty cannot be claimed when the original lead and added service were created by the same user.' });
  }
  if (!eligibility.eligible) {
    return res.status(400).json({ error: 'Claim Royalty is available only after two different users contribute service rows to the same lead.' });
  }
  const financialYear = String(req.body?.financialYear || '').trim();
  const claimantTokens = royaltyIdentityTokens(req.user?._id, req.user?.id, req.user?.email, req.user?.name);
  const claimedRows = (Array.isArray(lead.serviceSelections) ? lead.serviceSelections : []).filter((row) => {
    const tokens = royaltyIdentityTokens(row?.createdByCrmUserId, row?.createdByEmail, row?.createdByName);
    return tokens.some((token) => claimantTokens.includes(token));
  });
  const servicesOffered = [...new Set(claimedRows.map((row) => String(row?.servicesOffered || '').trim()).filter(Boolean))];
  const eprCategories = [...new Set(claimedRows.map((row) => String(row?.eprCategory || '').trim()).filter(Boolean))];
  const result = await claimLeadRoyalty({ lead, claimant: req.user, financialYear, servicesOffered, eprCategories });
  if (result.expired) return res.status(400).json({ error: `The two-day correction window expired on ${String(result.correctionDeadline).slice(0, 10)}. Please contact an Admin.` });
  return res.status(result.skipped ? 200 : 201).json(result);
};

exports.requestDuplicateLeadApproval = async (req, res) => {
  try {
    const existingLeadId = String(req.body.existingLeadId || '').trim();
    const leadAssignedTo = String(req.body.leadAssignedTo || '').trim();
    const company = String(req.body.company || '').trim();
    const reason = String(req.body.reason || '').trim();
    const requesterEmail = String(req.body.requesterEmail || req.user?.email || '').trim().toLowerCase();
    const screenshotUrl = String(req.body.screenshotUrl || '').trim();
    const candidateUsers = Array.isArray(req.body.candidateUsers) ? req.body.candidateUsers.slice(0, 10).map((item) => ({ id: String(item?.id || '').trim(), name: String(item?.name || '').trim() })).filter((item) => item.id && item.name) : [];
    if (!existingLeadId || !company) return res.status(400).json({ error: 'Existing lead and company are required.' });
    if (reason.length < 10) return res.status(400).json({ error: 'Please enter a reason of at least 10 characters.' });
    const requestedById = String(req.user?._id || req.user?.id || '');
    if (requestedById && !candidateUsers.some((item) => item.id === requestedById)) candidateUsers.push({ id: requestedById, name: String(req.user?.name || req.user?.email || 'Requesting user') });
    const companyIdentity = normalizeCompanyIdentity(company);
    const sourceClientId = `${existingLeadId}:${requestedById}`;
    const now = new Date();
    const approval = await PendingApproval.findOneAndUpdate(
      { type: 'lead_duplicate', source: 'crm', sourceClientId },
      {
        $set: {
          uniqueId: `DUP-${existingLeadId}`,
          clientName: company,
          approvalStatus: 'PENDING',
          createdByName: req.user?.name || req.user?.email || 'CRM User',
          requestDate: now.toISOString().slice(0, 10),
          requestTime: now.toTimeString().slice(0, 8),
          payload: { existingLeadId, leadAssignedTo, company, companyIdentity, reason, requesterEmail, screenshotUrl, requestedById, candidateUsers },
          remarks: reason,
          actionBy: null,
          actionAt: null
        },
        $setOnInsert: { type: 'lead_duplicate', source: 'crm', sourceClientId }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await Notification.create({
      title: 'Duplicate lead special approval requested',
      description: `${req.user?.name || requesterEmail} requested permission for ${company}.`,
      tag: 'Lead Approval',
      kind: 'lead_duplicate_approval',
      createdBy: req.user?._id,
      createdByName: req.user?.name || req.user?.email || '',
      visibleToRoles: ['admin', 'superadmin'],
      attachmentName: screenshotUrl ? 'Duplicate lead screenshot' : '',
      attachmentUrl: screenshotUrl,
      metadata: { approvalId: String(approval._id), company, existingLeadId }
    });
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false }, email: { $ne: '' } }).select('email').lean();
    const approvalHtml = `<div style="font-family:Arial,sans-serif;color:#334155"><h2 style="color:#0f766e">Special approval requested</h2><p><strong>${escapeHtml(req.user?.name || requesterEmail || 'CRM User')}</strong> requested permission to create another lead for <strong>${escapeHtml(company)}</strong>.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p><strong>Requester:</strong> ${escapeHtml(requesterEmail)}</p><p>Please review this request in Pending Approval.</p></div>`;
    await Promise.allSettled(admins.map((admin) => sendMail(admin.email, `Special Approval - ${company}`, approvalHtml, { branded: false })));
    return res.status(201).json({ ok: true, approval });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to request special approval.' });
  }
};

exports.listDuplicateLeadApprovals = async (req, res) => {
  const admin = ['admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());
  if (!admin && req.user?._id) {
    const legacyServiceNotifications = await Notification.find({
      kind: 'lead_additional_services',
      audience: req.user._id,
      'metadata.eventKey': { $exists: true, $ne: '' }
    }).select('metadata createdBy createdByName createdAt').populate('createdBy', 'name email').lean();
    await Promise.all(legacyServiceNotifications.map(async (notification) => {
      const metadata = notification.metadata || {};
      const eventKey = String(metadata.eventKey || '').trim();
      if (!eventKey) return null;
      const contributorId = String(notification.createdBy?._id || notification.createdBy || '');
      const contributorName = notification.createdBy?.name || metadata.actorName || notification.createdByName || 'CRM User';
      const contributorEmail = notification.createdBy?.email || metadata.contributorEmail || '';
      const approval = await PendingApproval.findOneAndUpdate(
        { type: 'lead_service', source: 'crm', sourceClientId: eventKey },
        {
          $setOnInsert: {
            type: 'lead_service',
            source: 'crm',
            sourceClientId: eventKey,
            uniqueId: `SERVICE-${metadata.leadId || notification._id}`,
            clientName: metadata.company || 'Company',
            approvalStatus: 'PENDING',
            createdByName: metadata.actorName || notification.createdByName || 'CRM User',
            requestDate: new Date(notification.createdAt || Date.now()).toISOString().slice(0, 10),
            requestTime: new Date(notification.createdAt || Date.now()).toTimeString().slice(0, 8),
            nextReminderAt: new Date(Date.now() + 10 * 60 * 1000),
            payload: {
              eventKey,
              leadId: metadata.leadId || '',
              company: metadata.company || '',
              contributorId,
              contributorName,
              contributorEmail,
              originalCreatorId: String(req.user._id),
              originalCreator: req.user.name || req.user.email || '',
              originalCreatorEmail: req.user.email || '',
              preliminaryStatus: 'PENDING',
              finalStatus: 'PENDING',
              groups: metadata.groups || []
            },
            remarks: 'Awaiting preliminary review by the original lead creator.'
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const payload = {
        ...(approval.payload || {}),
        contributorId,
        contributorName,
        ...(contributorEmail ? { contributorEmail } : {})
      };
      await PendingApproval.updateOne({ _id: approval._id }, { $set: { payload } });
      return approval;
    }));
  }
  const query = { type: { $in: ['lead_duplicate', 'lead_royalty', 'lead_service'] } };
  if (!admin) {
    const userId = String(req.user?._id || req.user?.id || '');
    query.$or = [{ 'payload.requestedById': userId }, { 'payload.claimantId': userId }, { 'payload.originalCreatorId': userId }];
  }
  const approvals = await PendingApproval.find(query).populate('actionBy', 'name email').sort({ createdAt: -1 }).lean();
  res.json({ ok: true, approvals });
};

exports.updateDuplicateLeadApproval = async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Status must be APPROVED or REJECTED.' });
  const current = await PendingApproval.findOne({ _id: req.params.id, type: { $in: ['lead_duplicate', 'lead_royalty', 'lead_service'] } }).lean();
  if (!current) return res.status(404).json({ error: 'Lead approval request not found.' });
  const isAdmin = ADMIN_ROLES.includes(String(req.user?.role || '').trim().toLowerCase());
  const userId = String(req.user?._id || req.user?.id || '');
  if (current.type !== 'lead_service' && !isAdmin) return res.status(403).json({ error: 'Admin access is required.' });
  if (current.type === 'lead_service') {
    const isCreator = userId && userId === String(current.payload?.originalCreatorId || '');
    if (!isAdmin && !isCreator) return res.status(403).json({ error: 'Only the original lead creator or an Admin can review this request.' });
    const payload = { ...(current.payload || {}) };
    const actorName = req.user?.name || req.user?.email || (isAdmin ? 'Admin' : 'Original lead creator');
    const decisionReason = String(req.body.remarks || '').trim();
    if (status === 'REJECTED' && !decisionReason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }
    if (isAdmin) {
      if (!['APPROVED', 'REJECTED'].includes(String(payload.preliminaryStatus || '').toUpperCase())) {
        return res.status(409).json({ error: 'The original lead creator must complete the preliminary review before final Admin action.' });
      }
      payload.finalStatus = status;
      payload.finalActionBy = actorName;
      payload.finalActionAt = new Date();
      payload.finalReason = decisionReason;
    } else {
      payload.preliminaryStatus = status;
      payload.preliminaryActionBy = actorName;
      payload.preliminaryActionAt = new Date();
      payload.preliminaryReason = decisionReason;
    }
    const approval = await PendingApproval.findOneAndUpdate(
      { _id: req.params.id },
      { $set: {
        payload,
        ...(isAdmin ? { approvalStatus: status } : {}),
        ...(!isAdmin ? { nextReminderAt: null } : {}),
        actionBy: req.user?._id,
        actionAt: new Date(),
        remarks: isAdmin
          ? `Final ${status.toLowerCase()} by ${actorName}${decisionReason ? `: ${decisionReason}` : ''}`
          : `Preliminary ${status.toLowerCase()} by ${actorName}${decisionReason ? `: ${decisionReason}` : ''}; awaiting final Admin review.`
      } },
      { new: true }
    );
    const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: { $ne: false } }).select('email').lean();
    const emails = [
      approval.payload?.originalCreatorEmail,
      approval.payload?.contributorEmail,
      ...admins.map((admin) => admin.email)
    ].map((email) => String(email || '').trim()).filter((email, index, rows) => email && rows.indexOf(email) === index);
    const stage = isAdmin ? 'Final Legal Review' : 'Preliminary Review';
    const decisionRows = `<tr><td style="padding:10px;font-weight:700">Original Creator Decision</td><td style="padding:10px">${escapeHtml(payload.preliminaryStatus || 'PENDING')}</td></tr>
      <tr><td style="padding:10px;font-weight:700">Creator Reason</td><td style="padding:10px">${escapeHtml(payload.preliminaryReason || '-')}</td></tr>
      <tr><td style="padding:10px;font-weight:700">Final Admin Decision</td><td style="padding:10px">${escapeHtml(payload.finalStatus || 'PENDING')}</td></tr>
      <tr><td style="padding:10px;font-weight:700">Final Admin Reason</td><td style="padding:10px">${escapeHtml(payload.finalReason || '-')}</td></tr>`;
    const preliminaryNote = '<div style="margin:20px 0;padding:14px 16px;background:#fff7ed;border-left:4px solid #f97316;border-radius:6px;color:#9a3412"><strong>This is a preliminary decision made by the assigned user. The final approval authority rests with the Admin/Super Admin.</strong></div>';
    const html = `<div style="max-width:680px;font-family:Arial,sans-serif;color:#334155;line-height:1.6">
      <h2 style="color:${status === 'REJECTED' ? '#b91c1c' : '#0f766e'}">${escapeHtml(stage)}: ${escapeHtml(status)}</h2>
      <p>The additional service request for <strong>${escapeHtml(approval.clientName)}</strong> has been <strong>${status.toLowerCase()}</strong> by <strong>${escapeHtml(actorName)}</strong>.</p>
      ${decisionReason ? `<p><strong>Reason:</strong><br>${escapeHtml(decisionReason)}</p>` : ''}
      ${!isAdmin ? preliminaryNote : '<div style="margin:20px 0;padding:14px 16px;background:#ecfdf5;border-left:4px solid #059669;border-radius:6px;color:#065f46"><strong>This is the final decision recorded by the Admin/Super Admin.</strong></div>'}
      <table style="width:100%;margin-top:18px;border-collapse:collapse;border:1px solid #e2e8f0">${decisionRows}</table>
      <p style="margin-top:24px"><strong>Thanks &amp; Regards,</strong><br><strong>Team Ananttattva</strong></p>
    </div>`;
    const subject = isAdmin
      ? `Final Service Request ${status} - ${approval.clientName}`
      : `Preliminary Service Request ${status} - ${approval.clientName}`;
    await Promise.allSettled(emails.map((email) => sendMail(email, subject, html, { branded: false })));
    return res.json({ ok: true, approval });
  }
  const selectedUserId = String(req.body.selectedUserId || '').trim();
  const claimantRatio = Number(req.body.claimantRatio);
  const originalCreatorRatio = Number(req.body.originalCreatorRatio);
  if (current.type === 'lead_duplicate' && status === 'APPROVED' && !selectedUserId) return res.status(400).json({ error: 'Select the user who will own the approved lead.' });
  if (current.type === 'lead_royalty' && status === 'APPROVED' && (!Number.isFinite(claimantRatio) || !Number.isFinite(originalCreatorRatio) || claimantRatio < 0 || originalCreatorRatio < 0 || claimantRatio + originalCreatorRatio !== 100)) {
    return res.status(400).json({ error: 'Enter valid royalty ratios totaling exactly 100%.' });
  }
  const payload = {
    ...(current.payload || {}),
    ...(selectedUserId ? { selectedUserId } : {}),
    ...(current.type === 'lead_royalty' && status === 'APPROVED' ? { claimantRatio, originalCreatorRatio } : {})
  };
  const approval = await PendingApproval.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { approvalStatus: status, payload, actionBy: req.user?._id, actionAt: new Date(), remarks: String(req.body.remarks || `${status} by ${req.user?.name || req.user?.email || 'admin'}`).trim() } },
    { new: true }
  );
  if (!approval) return res.status(404).json({ error: 'Lead approval request not found.' });
  const requesterId = approval.payload?.requestedById;
  const resultAudience = [requesterId, approval.payload?.originalCreatorId].filter((id, index, rows) => mongoose.isValidObjectId(id) && rows.indexOf(id) === index);
  await Notification.create({
    title: `${approval.type === 'lead_royalty' ? 'Royalty claim' : 'Duplicate lead request'} ${status.toLowerCase()}`,
    description: `${approval.clientName} was ${status.toLowerCase()} by ${req.user?.name || req.user?.email || 'Admin'}${approval.type === 'lead_royalty' && status === 'APPROVED' ? `. Royalty split: ${claimantRatio}% / ${originalCreatorRatio}%.` : ''}`,
    tag: 'Lead Approval',
    kind: approval.type === 'lead_royalty' ? 'lead_royalty_claim_result' : 'lead_duplicate_approval_result',
    createdBy: req.user?._id,
    createdByName: req.user?.name || req.user?.email || '',
    audience: resultAudience,
    metadata: { approvalId: String(approval._id), company: approval.clientName, status, selectedUserId, claimantRatio, originalCreatorRatio }
  });
  const resultEmails = [approval.payload?.requesterEmail, approval.payload?.claimantEmail, approval.payload?.originalCreatorEmail].map((value) => String(value || '').trim()).filter((value, index, rows) => value && rows.indexOf(value) === index);
  if (resultEmails.length) {
    const detail = approval.type === 'lead_royalty' && status === 'APPROVED'
      ? `<p><strong>Royalty ratio:</strong> ${claimantRatio}% claimant / ${originalCreatorRatio}% original creator</p>`
      : selectedUserId ? `<p><strong>Selected lead owner:</strong> ${selectedUserId}</p>` : '';
    await Promise.allSettled(resultEmails.map((email) => sendMail(email, `${approval.type === 'lead_royalty' ? 'Royalty Claim' : 'Special Approval'} ${status} - ${approval.clientName}`, `<div style="font-family:Arial,sans-serif;color:#334155"><h2 style="color:#0f766e">${status === 'APPROVED' ? 'Request approved' : 'Request rejected'}</h2><p>Your request for <strong>${escapeHtml(approval.clientName)}</strong> was ${status.toLowerCase()}.</p>${detail}<p>Please review the CRM Notification Center for complete details.</p></div>`, { branded: false })));
  }
  return res.json({ ok: true, approval });
};

exports._test = {
  usesDirectApplicantType,
  cleanBody,
  validateSubmittedLead,
  bulkServiceRow,
  normalizeLegacyBulkServices,
  alignBulkAssignments,
  buildBulkCreateData,
  buildBulkMergeData,
  buildBulkUserIndex,
  resolveBulkCreator,
  changedFollowUpIndexes
};

const LeadServiceCatalog = require('../models/LeadServiceCatalog');

function cleanCatalogValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

exports.listServiceCatalog = async (req, res) => {
  const entries = await LeadServiceCatalog.find().sort({ category: 1 }).lean();
  return res.json({ catalog: entries.map((entry) => ({
    category: entry.category,
    servicesOffered: [...(entry.servicesOffered || [])].sort((a, b) => a.localeCompare(b))
  })) });
};

exports.createServiceCatalogCategory = async (req, res) => {
  const category = cleanCatalogValue(req.body.category);
  if (!category) return res.status(400).json({ error: 'Service Category is required.' });
  if (category.length > 100) return res.status(400).json({ error: 'Service Category must be 100 characters or fewer.' });
  try {
    const entry = await LeadServiceCatalog.create({
      category,
      normalizedCategory: category.toLowerCase(),
      servicesOffered: [],
      createdBy: req.user?._id,
      updatedBy: req.user?._id
    });
    return res.status(201).json({ catalog: { category: entry.category, servicesOffered: [] } });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This Service Category already exists.' });
    throw error;
  }
};

exports.addServiceCatalogOffering = async (req, res) => {
  const category = cleanCatalogValue(req.params.category);
  const requestedServices = (Array.isArray(req.body.services) ? req.body.services : [req.body.service])
    .map(cleanCatalogValue)
    .filter(Boolean);
  const uniqueServices = [...new Map(requestedServices.map((service) => [service.toLowerCase(), service])).values()];
  if (!uniqueServices.length) return res.status(400).json({ error: 'At least one Services Offered value is required.' });
  if (uniqueServices.some((service) => service.length > 100)) return res.status(400).json({ error: 'Each Services Offered value must be 100 characters or fewer.' });
  const entry = await LeadServiceCatalog.findOne({ normalizedCategory: category.toLowerCase() });
  if (!entry) return res.status(404).json({ error: 'Service Category was not found.' });
  const existing = new Set(entry.servicesOffered.map((value) => value.toLowerCase()));
  const servicesToAdd = uniqueServices.filter((service) => !existing.has(service.toLowerCase()));
  if (!servicesToAdd.length) return res.status(409).json({ error: 'All entered Services Offered values already exist in the selected category.' });
  entry.servicesOffered.push(...servicesToAdd);
  entry.updatedBy = req.user?._id;
  await entry.save();
  return res.status(201).json({ catalog: { category: entry.category, servicesOffered: entry.servicesOffered }, addedServices: servicesToAdd });
};
