const mongoose = require('mongoose');
const Client = require('../models/Client');
const Quotation = require('../models/Quotation');
const AnnualReturn = require('../models/AnnualReturn');
const PendingApproval = require('../models/PendingApproval');
const ClientComplianceReview = require('../models/ClientComplianceReview');
const { notifyManagerAnnualSubmitted } = require('../services/annualReviewNotifications');
const { notifyPoSpecialApproval } = require('../services/poApprovalNotifications');
const { queuePendingClientReminder } = require('../services/pendingApprovalNotifications');
const { notifyClientApprovalDecision } = require('../services/clientApprovalDecisionNotifications');
const { mapQuotationPendingApprovalRow } = require('./quotationController');
const { getVisibleUserScope, ownerFilter } = require('../utils/visibilityScope');
const { CLIENT_APPROVAL_ROLES } = require('../constants/roles');
const { analyzeClientMasterData } = require('../services/userProductivityReport');

function normalizeApprovalStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  return ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : '';
}

function validateClientSubmissionCompletion(data = {}, workflowStatus = 'draft') {
  if (workflowStatus !== 'submitted') return '';
  const analysis = analyzeClientMasterData(data);
  const percentage = analysis.totalCount ? Math.round((analysis.filledCount / analysis.totalCount) * 100) : 0;
  return percentage < 60 ? `To submit Client Master, please complete at least 60% of the data. Current completion is ${percentage}%.` : '';
}

function normalizeRoleName(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function hasAnnualRole(user, roles = []) {
  const userRole = normalizeRoleName(user?.role);
  return roles.some((role) => userRole === normalizeRoleName(role));
}

function readAnnualWorkflowStage(workflow = {}) {
  const currentStage = String(workflow.currentStage || '').toLowerCase();
  const status = String(workflow.status || '').toLowerCase();
  if (currentStage === 'manager' || status === 'manager_pending') return 'manager';
  if (currentStage === 'compliance' || status === 'compliance_pending') return 'compliance';
  if (currentStage === 'complete' || status === 'compliance_approved') return 'complete';
  return 'user';
}

function latestAnnualWorkflowAction(workflow = {}) {
  const history = Array.isArray(workflow.history) ? workflow.history : [];
  return String(history[history.length - 1]?.action || '').trim().toUpperCase();
}

function validateAnnualWorkflowPermission(existingWorkflow = {}, incomingWorkflow = {}, user = {}) {
  const isAdmin = hasAnnualRole(user, ['admin', 'superadmin']);
  const isManager = isAdmin || hasAnnualRole(user, ['manager', 'management', 'team manager', 'operation head', 'operations head']);
  const isComplianceManager = isAdmin || hasAnnualRole(user, ['compliance', 'compliance manager']);
  const currentStage = readAnnualWorkflowStage(existingWorkflow);
  const nextStage = readAnnualWorkflowStage(incomingWorkflow);
  const currentStatus = String(existingWorkflow.status || 'draft').toLowerCase();
  const nextStatus = String(incomingWorkflow.status || 'draft').toLowerCase();
  const action = latestAnnualWorkflowAction(incomingWorkflow);

  if (action.startsWith('MANAGER_') && !isManager) {
    return 'Only Manager can approve or reject manager review.';
  }
  if (action.startsWith('COMPLIANCE_') && !isComplianceManager) {
    return 'Only Compliance Manager can approve or reject compliance review.';
  }

  const workflowMoved = currentStage !== nextStage || currentStatus !== nextStatus;
  if (!workflowMoved) return '';

  if (nextStatus === 'manager_pending' && nextStage === 'manager') return '';
  if (nextStatus === 'compliance_pending' && nextStage === 'compliance') {
    if (action.startsWith('COMPLIANCE_') || currentStage === 'compliance' || currentStatus === 'compliance_pending') {
      return isComplianceManager ? '' : 'Only Compliance Manager can approve or reject compliance review.';
    }
    return isManager ? '' : 'Only Manager can move annual approval to compliance review.';
  }
  if (nextStatus === 'manager_rejected' && !isManager) {
    return 'Only Manager can approve or reject manager review.';
  }
  if (['compliance_approved', 'compliance_rejected'].includes(nextStatus) && !isComplianceManager) {
    return 'Only Compliance Manager can approve or reject compliance review.';
  }
  if (nextStage === 'complete' && !isComplianceManager) {
    return 'Only Compliance Manager can complete annual approval.';
  }

  return '';
}

function normalizeAnnualWorkflowForStatus(workflow = {}, status = '') {
  const safeWorkflow = isPlainObject(workflow) ? workflow : {};
  const normalizedStatus = String(status || safeWorkflow.status || '').trim().toLowerCase();
  const hasWorkflowStage = Boolean(safeWorkflow.currentStage || safeWorkflow.status);
  if (hasWorkflowStage) return safeWorkflow;

  if (normalizedStatus === 'manager_pending') return { ...safeWorkflow, status: 'manager_pending', currentStage: 'manager' };
  if (normalizedStatus === 'compliance_pending') return { ...safeWorkflow, status: 'compliance_pending', currentStage: 'compliance' };
  if (normalizedStatus === 'compliance_rejected') return { ...safeWorkflow, status: 'compliance_rejected', currentStage: 'manager' };
  if (normalizedStatus === 'compliance_approved') return { ...safeWorkflow, status: 'compliance_approved', currentStage: 'complete' };
  if (normalizedStatus === 'manager_rejected') return { ...safeWorkflow, status: 'manager_rejected', currentStage: 'user' };

  return safeWorkflow;
}

function annualReviewStatusRank(status = '') {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'approved' || normalized === 'rejected') return 4;
  if (normalized === 'submitted') return 3;
  if (normalized === 'pending') return 2;
  if (normalized === 'waiting' || normalized === 'locked') return 1;
  return 0;
}

function preferAnnualReviewStatus(currentStatus = '', incomingStatus = '') {
  return annualReviewStatusRank(incomingStatus) >= annualReviewStatusRank(currentStatus)
    ? String(incomingStatus || '').trim().toLowerCase()
    : String(currentStatus || '').trim().toLowerCase();
}

function mergeAnnualSectionMeta(current = {}, incoming = {}) {
  const currentMeta = isPlainObject(current) ? current : {};
  const incomingMeta = isPlainObject(incoming) ? incoming : {};
  const merged = { ...currentMeta, ...incomingMeta };
  const managerStatus = preferAnnualReviewStatus(currentMeta.managerStatus || currentMeta.status, incomingMeta.managerStatus || incomingMeta.status);
  const complianceStatus = preferAnnualReviewStatus(currentMeta.complianceStatus, incomingMeta.complianceStatus);
  const status = preferAnnualReviewStatus(currentMeta.status, incomingMeta.status || managerStatus || complianceStatus);
  return {
    ...merged,
    status: status || merged.status || '',
    managerStatus: managerStatus || merged.managerStatus || '',
    complianceStatus: complianceStatus || merged.complianceStatus || ''
  };
}

function mergeAnnualWorkflowForSave(existingWorkflow = {}, incomingWorkflow = {}) {
  const existing = isPlainObject(existingWorkflow) ? existingWorkflow : {};
  const incoming = isPlainObject(incomingWorkflow) ? incomingWorkflow : {};
  const existingSections = isPlainObject(existing.sections) ? existing.sections : {};
  const incomingSections = isPlainObject(incoming.sections) ? incoming.sections : {};
  const sections = {};

  [...new Set([...Object.keys(existingSections), ...Object.keys(incomingSections)])].forEach((title) => {
    sections[title] = mergeAnnualSectionMeta(existingSections[title], incomingSections[title]);
  });

  return {
    ...existing,
    ...incoming,
    history: Array.isArray(incoming.history) && incoming.history.length >= (Array.isArray(existing.history) ? existing.history.length : 0)
      ? incoming.history
      : (Array.isArray(existing.history) ? existing.history : []),
    sections
  };
}

function normalizeHeaderKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function buildValueLookup(source, prefix = '', lookup = {}) {
  if (!source || typeof source !== 'object') return lookup;

  Object.entries(source).forEach(([key, value]) => {
    const ownKey = normalizeHeaderKey(key);
    const pathKey = normalizeHeaderKey(`${prefix} ${key}`);
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      buildValueLookup(value, `${prefix} ${key}`, lookup);
      return;
    }
    if (isFilled(value)) {
      if (!lookup[ownKey]) lookup[ownKey] = value;
      if (!lookup[pathKey]) lookup[pathKey] = value;
    }
  });

  return lookup;
}

function pickLookup(lookup, aliases) {
  for (const alias of aliases) {
    const value = lookup[normalizeHeaderKey(alias)];
    if (isFilled(value)) return String(value).trim();
  }
  return '';
}

function normalizeCollection(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  if (Array.isArray(payload?.result?.[key])) return payload.result[key];
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function readClientName(client) {
  return client.data?.basic?.clientLegalName
    || client.data?.basic?.tradeName
    || client.selectedLead?.company
    || 'Untitled client';
}

function readCreatedBy(client) {
  return client.createdBy?.name
    || client.createdBy?.email
    || client.data?.importMeta?.createdBy
    || client.selectedLead?.importedCreatedBy
    || 'CRM User';
}

function hasQuotationData(client) {
  const validation = client.data?.validation || {};
  return Boolean(validation.quotationNumber || validation.quotationDate || validation.quotationDocument);
}

function approvalDateParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { date: '-', time: '-' };
  }

  return {
    date: date.toLocaleDateString('en-GB'),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
}

function readApprovalDateParts(client) {
  const lookup = buildValueLookup(client);
  const importedDate = pickLookup(lookup, ['Creation Date', 'Created Date', 'Request Date', 'Date']);
  const importedTime = pickLookup(lookup, ['Creation Time', 'Created Time', 'Request Time', 'Time']);

  if (importedDate || importedTime) {
    return { date: importedDate || '-', time: importedTime || '-' };
  }

  return approvalDateParts(client.createdAt || client.updatedAt);
}

function getPendingClientKey(row) {
  return String(row.uniqueId || row.id || row.clientName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getPendingClientKeys(row) {
  const identityKeys = [
    row.id,
    row.uniqueId
  ].map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean);
  if (identityKeys.length) return identityKeys;

  return [
    row.clientName
  ].map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean);
}

function isDemoCreator(value) {
  return /^demo(?:\s+demo)?$/i.test(String(value || '').trim());
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isMongoObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function readAssignedToId(value) {
  if (!value) return '';
  if (isMongoObjectId(value)) return String(value);
  if (!isPlainObject(value)) return '';

  const candidates = [
    value._id,
    value.id,
    value.userId,
    value.mongoId
  ];
  const match = candidates.find((candidate) => isMongoObjectId(candidate));
  return match ? String(match) : '';
}

function readAssignedToLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (!isPlainObject(value)) return '';
  return String(value.name || value.email || value.crmUserId || value.userId || '').trim();
}

function normalizeAdminControls(adminControls = {}) {
  const normalized = isPlainObject(adminControls) ? { ...adminControls } : {};
  const visibility = String(normalized.visibilityStatus || '').trim().toUpperCase();
  normalized.visibilityStatus = ['LIVE', 'SUSPENDED', 'DISCONTINUED'].includes(visibility) ? visibility : 'LIVE';
  const assignedToId = readAssignedToId(normalized.assignedTo);

  if (assignedToId) {
    normalized.assignedTo = assignedToId;
  } else {
    delete normalized.assignedTo;
  }

  return normalized;
}

function normalizeClientRequestPayload(body = {}) {
  const data = isPlainObject(body.data) ? { ...body.data } : {};
  const adminControls = normalizeAdminControls(body.adminControls);
  const assignedToLabel = readAssignedToLabel(body.adminControls?.assignedTo);

  if (assignedToLabel) {
    data.importMeta = {
      ...(isPlainObject(data.importMeta) ? data.importMeta : {}),
      assignedTo: data.importMeta?.assignedTo || assignedToLabel
    };
  }

  return { data, adminControls };
}

function readClientAssignedServiceId(body = {}, data = {}) {
  return String(body.assignedServiceId || data.assignedServiceId || data.selectedLeadSnapshot?.assignedServiceId || '').trim();
}

function mergeAssignedServiceCpcbData(existingData = {}, incomingData = {}) {
  return {
    ...incomingData,
    cpcbDataByAssignedServiceId: {
      ...(isPlainObject(existingData.cpcbDataByAssignedServiceId) ? existingData.cpcbDataByAssignedServiceId : {}),
      ...(isPlainObject(incomingData.cpcbDataByAssignedServiceId) ? incomingData.cpcbDataByAssignedServiceId : {})
    },
    serviceDetailsByAssignedServiceId: {
      ...(isPlainObject(existingData.serviceDetailsByAssignedServiceId) ? existingData.serviceDetailsByAssignedServiceId : {}),
      ...(isPlainObject(incomingData.serviceDetailsByAssignedServiceId) ? incomingData.serviceDetailsByAssignedServiceId : {})
    }
  };
}

function readSelectedLeadId(value) {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : undefined;
}

function normalizeAnnualYearKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function setNestedValue(target, path, value) {
  const parts = String(path || '').split('.').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  });
}

function buildAnnualReturnFiling(draft = {}, annualYear = '', meta = {}) {
  const safeDraft = isPlainObject(draft) ? draft : {};
  const parsed = {};
  const approvalWorkflow = normalizeAnnualWorkflowForStatus(meta.approvalWorkflow, meta.status);

  Object.entries(safeDraft).forEach(([key, value]) => {
    if (key === 'savedAt') return;
    setNestedValue(parsed, key, value);
  });

  return {
    annualYear,
    status: String(meta.status || 'draft').trim() || 'draft',
    activeTab: String(meta.activeTab || '').trim(),
    activeSection: String(meta.activeSection || '').trim(),
    draft: safeDraft,
    basicInfo: parsed.basic || {},
    financials: parsed.financials || {},
    data: parsed.data || {},
    brandOwner: parsed.brandOwner || {},
    importer: parsed.importer || {},
    annual: parsed.annual || {},
    approvalWorkflow,
    savedAt: new Date(),
    updatedBy: meta.updatedBy
  };
}

function getAnnualReturnClientKey(client, fallback = '') {
  return String(
    client?._id
    || client?.id
    || client?.data?.importMeta?.uniqueId
    || fallback
    || ''
  ).trim();
}

function getAnnualReturnClientName(client) {
  return String(
    client?.data?.basic?.clientLegalName
    || client?.data?.basic?.tradeName
    || client?.selectedLead?.company
    || 'Untitled client'
  ).trim();
}

function mapAnnualReturnRecordToFiling(row = {}) {
  return {
    annualYear: row.annualYear,
    status: row.status || row.approvalWorkflow?.status || 'draft',
    activeTab: row.activeTab || '',
    activeSection: row.activeSection || '',
    draft: isPlainObject(row.draft) ? row.draft : {},
    basicInfo: isPlainObject(row.basicInfo) ? row.basicInfo : {},
    financials: isPlainObject(row.financials) ? row.financials : {},
    data: isPlainObject(row.data) ? row.data : {},
    brandOwner: isPlainObject(row.brandOwner) ? row.brandOwner : {},
    importer: isPlainObject(row.importer) ? row.importer : {},
    annual: isPlainObject(row.annual) ? row.annual : {},
    approvalWorkflow: isPlainObject(row.approvalWorkflow) ? row.approvalWorkflow : {},
    savedAt: row.savedAt || row.updatedAt || new Date(),
    updatedBy: row.updatedBy
  };
}

async function upsertAnnualReturnRecord(client, annualYear, filing, requestBody = {}, userId) {
  const clientKey = getAnnualReturnClientKey(client, requestBody.clientKey || requestBody.clientId);
  const clientData = isPlainObject(client.data) ? client.data : {};
  const { annualReturn: _annualReturn, ...clientDataSnapshot } = clientData;
  const basic = isPlainObject(clientData.basic) ? clientData.basic : {};
  const annual = isPlainObject(filing.annual) ? filing.annual : {};

  if (!clientKey || !annualYear) return null;

  const existingRecords = await AnnualReturn.find({ clientKey }).sort({ createdAt: 1, updatedAt: 1 });
  const canonical = existingRecords[0] || new AnnualReturn({ clientKey });
  const filings = {};

  existingRecords.forEach((record) => {
    const recordFilings = isPlainObject(record.filings) ? record.filings : {};
    Object.entries(recordFilings).forEach(([year, savedFiling]) => {
      if (year && isPlainObject(savedFiling)) filings[year] = savedFiling;
    });
    if (record.annualYear) {
      filings[record.annualYear] = {
        ...(isPlainObject(filings[record.annualYear]) ? filings[record.annualYear] : {}),
        ...mapAnnualReturnRecordToFiling(record)
      };
    }
  });

  filings[annualYear] = {
    ...(isPlainObject(filings[annualYear]) ? filings[annualYear] : {}),
    ...filing,
    annualYear,
    savedAt: filing.savedAt || new Date(),
    updatedBy: userId
  };

  const duplicateIds = existingRecords
    .filter((record) => String(record._id) !== String(canonical._id))
    .map((record) => record._id);
  const shouldDeferTopLevelYear = existingRecords.some((record) => (
    String(record._id) !== String(canonical._id) && String(record.annualYear || '') === String(annualYear)
  ));

  canonical.client = client._id;
  canonical.clientKey = clientKey;
  canonical.annualYear = shouldDeferTopLevelYear ? (canonical.annualYear || annualYear) : annualYear;
  canonical.clientName = getAnnualReturnClientName(client);
  canonical.piboCategory = String(basic.piboCategory || '').trim();
  canonical.eprCategory = String(basic.eprCategory || '').trim();
  canonical.currentSpoc = String(annual.currentSpoc || requestBody.currentSpoc || '').trim();
  canonical.previousSpoc = String(annual.previousSpoc || requestBody.previousSpoc || '').trim();
  canonical.status = filing.status;
  canonical.activeTab = filing.activeTab;
  canonical.activeSection = filing.activeSection;
  canonical.filings = filings;
  canonical.draft = filing.draft;
  canonical.basicInfo = filing.basicInfo;
  canonical.financials = filing.financials;
  canonical.data = filing.data;
  canonical.brandOwner = filing.brandOwner;
  canonical.importer = filing.importer;
  canonical.annual = filing.annual;
  canonical.approvalWorkflow = filing.approvalWorkflow;
  canonical.clientData = clientDataSnapshot;
  canonical.adminControls = isPlainObject(client.adminControls) ? client.adminControls : {};
  canonical.savedAt = filing.savedAt;
  canonical.updatedBy = userId;
  canonical.markModified('filings');

  await canonical.save();

  if (duplicateIds.length) {
    await AnnualReturn.deleteMany({ _id: { $in: duplicateIds } });
    if (shouldDeferTopLevelYear) {
      canonical.annualYear = annualYear;
      await canonical.save();
    }
    console.info('[AnnualReturn] consolidated duplicate client records', {
      clientKey,
      canonicalId: String(canonical._id),
      removed: duplicateIds.length,
      years: Object.keys(filings)
    });
  }

  return canonical;
}

function buildClientApprovalPayload(body = {}, status, userId, remarks = '') {
  const existingPayload = isPlainObject(body.payload) ? body.payload : {};
  const payloadData = isPlainObject(existingPayload.data) ? existingPayload.data : {};
  const payloadImportMeta = isPlainObject(payloadData.importMeta) ? payloadData.importMeta : {};
  const payloadAdminControls = isPlainObject(existingPayload.adminControls) ? existingPayload.adminControls : {};
  const adminControls = normalizeAdminControls(payloadAdminControls);
  const assignedToLabel = readAssignedToLabel(payloadAdminControls.assignedTo);
  const uniqueId = String(body.uniqueId || payloadImportMeta.uniqueId || '').trim();
  const sourceClientId = String(body.sourceClientId || existingPayload._id || existingPayload.id || '').trim();
  const fullData = Object.keys(payloadData).length
    ? payloadData
    : {
        basic: {
          clientLegalName: String(body.clientName || '').trim(),
          piboCategory: String(body.piboCategory || '').trim(),
          eprCategory: String(body.eprCategory || body.category || '').trim()
        }
      };

  return {
    adminControls: {
      ...adminControls,
      approvalStatus: status
    },
    data: {
      ...fullData,
      importMeta: {
        ...(isPlainObject(fullData.importMeta) ? fullData.importMeta : {}),
        assignedTo: fullData.importMeta?.assignedTo || assignedToLabel || '',
        uniqueId,
        sourceClientId: fullData.importMeta?.sourceClientId || sourceClientId,
        approvalOverride: true
      },
      approvalMeta: {
        status,
        source: String(body.source || 'crm').trim() || 'crm',
        actionBy: userId,
        actionAt: new Date(),
        remarks
      }
    }
  };
}

function mergePendingClients(localRows, incomingRows) {
  const merged = [];
  const indexByKey = new Map();

  [...incomingRows, ...localRows].forEach((row) => {
    const key = getPendingClientKey(row);
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      merged[index] = { ...merged[index], ...row };
      return;
    }

    if (key) indexByKey.set(key, merged.length);
    merged.push(row);
  });

  return merged;
}

function pendingApprovalFilter(row, type = 'client') {
  const source = String(row.source || 'crm').trim() || 'crm';
  const sourceClientId = String(row.id || row.sourceClientId || '').trim();
  const uniqueId = String(row.uniqueId || '').trim();

  if (sourceClientId) return { type, source, sourceClientId };
  if (uniqueId) return { type, source, uniqueId };

  return {
    type,
    source,
    clientName: String(row.clientName || row.companyName || '').trim()
  };
}

async function upsertPendingApproval(row, type = 'client') {
  const status = normalizeApprovalStatus(row.approvalStatus) || 'PENDING';
  const filter = pendingApprovalFilter(row, type);
  const source = String(row.source || 'crm').trim() || 'crm';
  const sourceClientId = String(row.id || row.sourceClientId || '').trim();
  const uniqueId = String(row.uniqueId || '').trim();
  const setOnInsert = { type, source };
  if (sourceClientId) setOnInsert.sourceClientId = sourceClientId;
  if (uniqueId) setOnInsert.uniqueId = uniqueId;
  if (status === 'PENDING') setOnInsert.nextReminderAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const existing = await PendingApproval.findOne(filter);
  const existingStatus = normalizeApprovalStatus(existing?.approvalStatus);

  if (existing && existingStatus && existingStatus !== 'PENDING') {
    existing.payload = row;
    existing.clientName = String(row.clientName || row.companyName || existing.clientName || '').trim();
    existing.piboCategory = String(row.piboCategory || existing.piboCategory || '').trim();
    existing.eprCategory = String(row.eprCategory || row.category || existing.eprCategory || '').trim();
    existing.createdByName = String(row.createdBy || row.userName || existing.createdByName || '').trim();
    existing.requestDate = String(row.requestDate || row.quotationDate || existing.requestDate || '').trim();
    existing.requestTime = String(row.requestTime || existing.requestTime || '').trim();
    await existing.save();
    return existing.toObject();
  }

  const record = await PendingApproval.findOneAndUpdate(
    filter,
    {
      $setOnInsert: setOnInsert,
      $set: {
        clientName: String(row.clientName || row.companyName || '').trim(),
        approvalStatus: status,
        piboCategory: String(row.piboCategory || '').trim(),
        eprCategory: String(row.eprCategory || row.category || '').trim(),
        createdByName: String(row.createdBy || row.userName || '').trim(),
        requestDate: String(row.requestDate || row.quotationDate || '').trim(),
        requestTime: String(row.requestTime || '').trim(),
        payload: row
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return record;
}

async function applyClientApprovalStatus(record, status, userId, remarks = '') {
  const sourceClientId = String(record.sourceClientId || '').trim();
  const client = mongoose.Types.ObjectId.isValid(sourceClientId)
    ? await Client.findById(sourceClientId)
    : null;
  const approvalBody = {
    ...(record.payload || {}),
    sourceClientId,
    uniqueId: record.uniqueId || record.payload?.uniqueId || '',
    payload: record.payload?.payload,
    source: record.source
  };
  const approvalFields = buildClientApprovalPayload(approvalBody, status, userId, remarks);

  if (client) {
    client.adminControls = { ...(client.adminControls || {}), ...approvalFields.adminControls };
    client.data = {
      ...(client.data || {}),
      ...(approvalFields.data || {}),
      approvalMeta: {
        status,
        source: String(record.source || 'crm').trim() || 'crm',
        actionBy: userId,
        actionAt: new Date(),
        remarks
      }
    };
    client.markModified('data');
    await client.save();
    return client;
  }

  return Client.create({
    adminControls: approvalFields.adminControls,
    data: approvalFields.data,
    workflowStatus: 'draft',
    createdBy: userId
  });
}

function mapPendingApprovalRecord(record) {
  const payload = record.payload || {};
  return {
    ...payload,
    approvalRecordId: record._id,
    id: record.sourceClientId || payload.id || record._id,
    source: record.source,
    uniqueId: record.uniqueId || payload.uniqueId || '',
    clientName: record.clientName || payload.clientName || payload.companyName || 'Untitled client',
    approvalStatus: record.approvalStatus,
    piboCategory: record.piboCategory || payload.piboCategory || '-',
    eprCategory: record.eprCategory || payload.eprCategory || payload.category || '-',
    createdBy: record.createdByName || payload.createdBy || payload.userName || '-',
    requestDate: record.requestDate || payload.requestDate || '-',
    requestTime: record.requestTime || payload.requestTime || '-',
    reminderFlag: record.reminderFlag || '',
    redFlagAt: record.redFlagAt || null,
    greenFlagDeadline: record.greenFlagDeadline || null
  };
}

function mapClientPendingApprovalRow(client, createdByLabel = 'CRM User') {
  const parts = approvalDateParts(client.createdAt || new Date());
  const data = client.data || {};

  return {
    id: client._id,
    selectedLeadId: client.selectedLead?._id || client.selectedLead || data.selectedLead || '',
    source: 'crm',
    uniqueId: data.importMeta?.uniqueId || '',
    clientName: data.basic?.clientLegalName || data.basic?.tradeName || 'Untitled client',
    approvalStatus: normalizeApprovalStatus(client.adminControls?.approvalStatus) || 'PENDING',
    piboCategory: data.basic?.piboCategory || '-',
    eprCategory: data.basic?.eprCategory || '-',
    createdBy: createdByLabel,
    requestDate: parts.date,
    requestTime: parts.time
  };
}

async function queueCreatedClientApproval(client, user) {
  const createdByLabel = user?.name || user?.email || 'CRM User';
  const record = await upsertPendingApproval(mapClientPendingApprovalRow(client, createdByLabel), 'client');
  await queuePendingClientReminder(record);
}

async function syncPendingApprovalRows(rows, type = 'client') {
  const records = [];

  for (const row of rows) {
    records.push(await upsertPendingApproval(row, type));
  }

  return records.map(mapPendingApprovalRecord);
}

async function readStoredPendingApprovals() {
  const records = await PendingApproval.find({ approvalStatus: 'PENDING' })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  const clientRecords = records.filter((record) => record.type === 'client');
  const sourceClientIds = clientRecords.map((record) => record.sourceClientId).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  const submittedClients = await Client.find({ _id: { $in: sourceClientIds }, workflowStatus: 'submitted' }).select('_id').lean();
  const submittedIds = new Set(submittedClients.map((client) => String(client._id)));

  return {
    pendingClients: clientRecords.filter((record) => submittedIds.has(String(record.sourceClientId))).map(mapPendingApprovalRecord),
    pendingQuotations: records.filter((record) => record.type === 'quotation').map(mapPendingApprovalRecord)
  };
}

function backgroundSyncPendingApprovals(clientRows = [], quotationRows = []) {
  setTimeout(async () => {
    try {
      await Promise.all([
        syncPendingApprovalRows(clientRows, 'client'),
        syncPendingApprovalRows(quotationRows, 'quotation')
      ]);
    } catch (err) {
      console.error('Pending approval background sync failed', err);
    }
  }, 0);
}

exports.listClients = async (req, res) => {
  const scope = await getVisibleUserScope(req.user);
  const clients = await Client.find({
    workflowStatus: 'submitted',
    'data.importMeta.approvalOverride': { $ne: true },
    ...ownerFilter(scope, 'createdBy', 'adminControls.assignedTo', [
      'data.importMeta.assignedTo'
    ])
  })
    .populate('selectedLead', 'leadCode company status emails mobileNo1 piboCategory eprCategory addressLine1 addressLine2 addressLine3 state city pinCode contactPerson designation serviceSelections addresses contacts assignments')
    .populate('adminControls.assignedTo', 'name email role avatarUrl')
    .sort({ createdAt: -1 });
  res.json({ ok: true, clients });
};

exports.listPendingApprovals = async (req, res) => {
  const startedAt = Date.now();
  const storedFallback = await readStoredPendingApprovals();
  const requesterRole = normalizeRoleName(req.user?.role);
  const isAdministrativeReviewer = ['admin', 'superadmin'].includes(requesterRole);
  const isClientReviewer = isAdministrativeReviewer || requesterRole.includes('compliance');

  res.json({
    ok: true,
    pendingClients: isClientReviewer ? storedFallback.pendingClients : [],
    pendingQuotations: isAdministrativeReviewer ? storedFallback.pendingQuotations : [],
    debug: {
      source: 'indexed-pending-approvals',
      ms: Date.now() - startedAt,
      storedClients: storedFallback.pendingClients.length,
      storedQuotations: storedFallback.pendingQuotations.length
    }
  });
};

exports.createClient = async (req, res) => {
  const workflowStatus = req.body.workflowStatus === 'submitted' ? 'submitted' : 'draft';
  const { data, adminControls } = normalizeClientRequestPayload(req.body);
  const selectedLead = readSelectedLeadId(req.body.selectedLead);
  const assignedServiceId = readClientAssignedServiceId(req.body, data);

  if (!assignedServiceId) {
    return res.status(400).json({ error: 'Assigned service is required to save Client Master data' });
  }

  if (workflowStatus === 'submitted' && !data?.basic?.clientLegalName) {
    return res.status(400).json({ error: 'Client Legal Name is required before submit' });
  }
  const completionError = validateClientSubmissionCompletion(data, workflowStatus);
  if (completionError) return res.status(400).json({ error: completionError });

  const existingClient = selectedLead && req.user?._id
    ? await Client.findOne({
        selectedLead,
        createdBy: req.user._id,
        $or: [
          { assignedServiceId },
          { 'data.assignedServiceId': assignedServiceId },
          { 'data.selectedLeadSnapshot.assignedServiceId': assignedServiceId }
        ]
      })
    : null;
  const client = existingClient || new Client();
  client.selectedLead = selectedLead;
  client.assignedServiceId = assignedServiceId;
  client.adminControls = adminControls;
  client.data = existingClient ? mergeAssignedServiceCpcbData(existingClient.data, data) : data;
  client.workflowStatus = workflowStatus;
  client.createdBy = existingClient?.createdBy || req.user?._id;
  client.markModified('data');
  await client.save();

  if (workflowStatus === 'submitted') await queueCreatedClientApproval(client, req.user);

  res.status(201).json({ ok: true, client });
};

async function createClientRecord(row, userId) {
  const workflowStatus = row.workflowStatus === 'submitted' ? 'submitted' : 'draft';
  const { data, adminControls } = normalizeClientRequestPayload(row);
  const selectedLead = readSelectedLeadId(row.selectedLead);

  if (workflowStatus === 'submitted' && !data?.basic?.clientLegalName) {
    const error = new Error('Client Legal Name is required before submit');
    error.statusCode = 400;
    throw error;
  }
  const completionError = validateClientSubmissionCompletion(data, workflowStatus);
  if (completionError) { const error = new Error(completionError); error.statusCode = 400; throw error; }

  const client = await Client.create({
    selectedLead,
    adminControls,
    data,
    workflowStatus,
    createdBy: userId
  });
  if (workflowStatus === 'submitted') await queueCreatedClientApproval(client, row.createdByUser);
  return client;
}

exports.bulkCreateClients = async (req, res) => {
  const rows = Array.isArray(req.body.clients) ? req.body.clients : [];
  if (!rows.length) return res.status(400).json({ error: 'No clients provided' });

  const clients = [];
  const failures = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const client = await createClientRecord({ ...rows[index], createdByUser: req.user }, req.user?._id);
      clients.push(client);
    } catch (err) {
      failures.push({
        row: index + 1,
        error: err.message || 'Unable to save client'
      });
    }
  }

  res.status(failures.length && !clients.length ? 400 : 201).json({
    ok: failures.length === 0,
    imported: clients.length,
    failed: failures.length,
    clients,
    failures
  });
};

exports.bulkUpdateClientYears = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'No annual return year rows provided' });

  let updated = 0;
  const failures = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const companyUniqueId = String(row.companyUniqueId || '').trim();
    const onboardingYear = String(row.onboardingYear || '').trim();
    const firstAnnualReturnYear = String(row.firstAnnualReturnYear || '').trim();

    if (!companyUniqueId || (!onboardingYear && !firstAnnualReturnYear)) {
      failures.push({ row: Number(row.row) || index + 2, error: 'Company Unique ID and at least one year value are required' });
      continue;
    }

    const client = await Client.findOne({
      $or: [{ 'data.importMeta.uniqueId': companyUniqueId }]
    });

    if (!client) {
      failures.push({ row: Number(row.row) || index + 2, error: 'Matching client not found in CRM' });
      continue;
    }

    client.data = {
      ...(isPlainObject(client.data) ? client.data : {}),
      basic: {
        ...(isPlainObject(client.data?.basic) ? client.data.basic : {}),
        ...(onboardingYear ? { onboardingYear } : {}),
        ...(firstAnnualReturnYear ? { firstAnnualReturnYear } : {})
      }
    };
    client.markModified('data');
    await client.save();
    updated += 1;
  }

  return res.status(failures.length && !updated ? 400 : 200).json({
    ok: failures.length === 0,
    updated,
    failed: failures.length,
    failures
  });
};

exports.updateClient = async (req, res) => {
  const workflowStatus = req.body.workflowStatus === 'submitted' ? 'submitted' : 'draft';
  const { data, adminControls } = normalizeClientRequestPayload(req.body);
  const selectedLead = readSelectedLeadId(req.body.selectedLead);
  const assignedServiceId = readClientAssignedServiceId(req.body, data);

  if (!assignedServiceId) {
    return res.status(400).json({ error: 'Assigned service is required to save Client Master data' });
  }

  if (workflowStatus === 'submitted' && !data?.basic?.clientLegalName) {
    return res.status(400).json({ error: 'Client Legal Name is required before submit' });
  }
  const completionError = validateClientSubmissionCompletion(data, workflowStatus);
  if (completionError) return res.status(400).json({ error: completionError });

  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const canApproveClient = CLIENT_APPROVAL_ROLES.includes(String(req.user?.role || '').trim().toLowerCase());
  const existingApprovalStatus = normalizeApprovalStatus(client.adminControls?.approvalStatus) || 'PENDING';
  const requestedApprovalStatus = normalizeApprovalStatus(adminControls.approvalStatus) || existingApprovalStatus;
  adminControls.approvalStatus = canApproveClient ? requestedApprovalStatus : existingApprovalStatus;

  client.selectedLead = selectedLead;
  client.assignedServiceId = assignedServiceId;
  client.adminControls = adminControls;
  const existingData = isPlainObject(client.data) ? client.data : {};
  client.data = mergeAssignedServiceCpcbData(existingData, data);
  client.workflowStatus = workflowStatus;
  client.markModified('data');
  await client.save();

  if (workflowStatus === 'submitted') await queueCreatedClientApproval(client, req.user);

  if (canApproveClient && requestedApprovalStatus !== 'PENDING' && requestedApprovalStatus !== existingApprovalStatus) {
    const actionAt = new Date();
    await PendingApproval.findOneAndUpdate(
      { type: 'client', sourceClientId: String(client._id), approvalStatus: 'PENDING' },
      {
        approvalStatus: requestedApprovalStatus,
        nextReminderAt: null,
        reminderFlag: 'GREEN',
        greenFlagAt: actionAt,
        redFlagAt: null,
        greenFlagDeadline: null,
        actionBy: req.user?._id,
        actionAt,
        remarks: 'Status updated from Client Master'
      }
    );
  }

  res.json({ ok: true, client });
};

exports.updateAnnualReturn = async (req, res) => {
  try {
    const annualYear = normalizeAnnualYearKey(req.body.annualYear);
    if (!annualYear) return res.status(400).json({ error: 'Annual return year is required' });
    const approvalWorkflow = isPlainObject(req.body.approvalWorkflow) ? req.body.approvalWorkflow : {};
    const workflowRemark = String(approvalWorkflow.remark || approvalWorkflow.lastRemark || '').trim();
    if (workflowRemark.length > 250) return res.status(400).json({ error: 'Remark must be 250 characters or less' });

    const clientId = String(req.params.id || '').trim();
    let client = mongoose.Types.ObjectId.isValid(clientId)
      ? await Client.findById(clientId)
      : await Client.findOne({
          $or: [
            { 'data.importMeta.uniqueId': clientId },
            { 'data.basic.clientLegalName': clientId },
            { 'data.basic.tradeName': clientId }
          ]
        });

    if (!client) {
      const clientData = isPlainObject(req.body.clientData) ? req.body.clientData : {};
      const importMeta = isPlainObject(clientData.importMeta) ? clientData.importMeta : {};
      const adminControls = normalizeAdminControls(req.body.adminControls);
      const assignedToLabel = readAssignedToLabel(req.body.adminControls?.assignedTo);
      client = new Client({
        data: {
          ...clientData,
          importMeta: {
            ...importMeta,
            assignedTo: importMeta.assignedTo || assignedToLabel || '',
            uniqueId: importMeta.uniqueId || clientId
          }
        },
        adminControls,
        workflowStatus: 'draft',
        createdBy: req.user?._id
      });
    }

    const currentData = isPlainObject(client.data) ? client.data : {};
    const currentAnnualReturn = isPlainObject(currentData.annualReturn) ? currentData.annualReturn : {};
    const currentFilings = isPlainObject(currentAnnualReturn.filings) ? currentAnnualReturn.filings : {};
    const existingFiling = isPlainObject(currentFilings[annualYear]) ? currentFilings[annualYear] : {};
    console.log('[AnnualReview:updateAnnualReturn] request', {
      clientId,
      annualYear,
      user: req.user?.email || req.user?.name || req.user?._id,
      role: req.user?.role,
      incomingStatus: req.body.status,
      incomingWorkflowStatus: approvalWorkflow.status,
      incomingStage: approvalWorkflow.currentStage,
      existingWorkflowStatus: existingFiling.approvalWorkflow?.status,
      existingStage: existingFiling.approvalWorkflow?.currentStage,
      incomingSections: Object.fromEntries(Object.entries(approvalWorkflow.sections || {}).map(([title, meta]) => [
        title,
        {
          status: meta?.status || '',
          managerStatus: meta?.managerStatus || '',
          complianceStatus: meta?.complianceStatus || '',
          reviewerRole: meta?.reviewerRole || ''
        }
      ]))
    });
    const workflowPermissionError = validateAnnualWorkflowPermission(
      isPlainObject(existingFiling.approvalWorkflow) ? existingFiling.approvalWorkflow : {},
      approvalWorkflow,
      req.user
    );
    if (workflowPermissionError) {
      console.warn('[AnnualReview:updateAnnualReturn] permission denied', {
        clientId,
        annualYear,
        user: req.user?.email || req.user?.name || req.user?._id,
        role: req.user?.role,
        workflowPermissionError
      });
      return res.status(403).json({ error: workflowPermissionError });
    }

    const filing = buildAnnualReturnFiling(req.body.draft, annualYear, {
      activeTab: req.body.activeTab,
      activeSection: req.body.activeSection,
      status: req.body.status,
      approvalWorkflow,
      updatedBy: req.user?._id
    });
    const mergedApprovalWorkflow = mergeAnnualWorkflowForSave(existingFiling.approvalWorkflow, filing.approvalWorkflow);
    const existingStatus = String(existingFiling.status || '').toLowerCase();
    const existingWorkflowStatus = String(existingFiling.approvalWorkflow?.status || '').toLowerCase();
    const nextStatus = String(filing.status || mergedApprovalWorkflow.status || '').toLowerCase();
    const userRole = String(req.user?.role || '').toLowerCase();
    const userSubmittedForManager = nextStatus === 'manager_pending' && !['manager', 'admin', 'superadmin', 'compliance'].includes(userRole);
    const shouldNotifyManager = userSubmittedForManager;
    const preventDuplicateManagerNotification = existingStatus === 'manager_pending' && existingWorkflowStatus === 'manager_pending';

    client.data = {
      ...currentData,
      annualReturn: {
        ...currentAnnualReturn,
        selectedYear: annualYear,
        lastSavedYear: annualYear,
        lastSavedAt: filing.savedAt,
        filings: {
          ...currentFilings,
          [annualYear]: {
            ...existingFiling,
            ...filing,
            approvalWorkflow: mergedApprovalWorkflow,
            draft: {
              ...(isPlainObject(existingFiling.draft) ? existingFiling.draft : {}),
              ...filing.draft
            }
          }
        }
      }
    };

    client.markModified('data');
    await client.save();
    const annualReturn = await upsertAnnualReturnRecord(client, annualYear, client.data.annualReturn.filings[annualYear], req.body, req.user?._id);
    let managerNotification = null;
    if (shouldNotifyManager) {
      managerNotification = await notifyManagerAnnualSubmitted({
        client,
        annualYear,
        submitter: req.user,
        preventDuplicate: preventDuplicateManagerNotification
      });
    }
    let poApprovalNotification = null;
    const purchaseOrderConfirmation = filing.draft?.purchaseOrderConfirmation;
    if (req.body.notifyPoApproval === true && purchaseOrderConfirmation?.mode === 'no' && purchaseOrderConfirmation?.confirmed) {
      try {
        poApprovalNotification = await notifyPoSpecialApproval({
          client,
          annualYear,
          submitter: req.user,
          workflow: purchaseOrderConfirmation
        });
      } catch (notificationError) {
        console.error('PO special approval notification failed', {
          clientId: String(client._id),
          annualYear,
          error: notificationError?.message || notificationError
        });
        poApprovalNotification = { ok: false, error: 'Approval saved, but reviewer notification could not be sent.' };
      }
    }
    console.log('[AnnualReview:updateAnnualReturn] saved', {
      clientId: String(client._id),
      annualYear,
      status: client.data.annualReturn.filings[annualYear]?.status,
      workflowStatus: client.data.annualReturn.filings[annualYear]?.approvalWorkflow?.status,
      stage: client.data.annualReturn.filings[annualYear]?.approvalWorkflow?.currentStage,
      annualReturnRecordStatus: annualReturn?.status,
      annualReturnRecordWorkflowStatus: annualReturn?.approvalWorkflow?.status,
      annualReturnRecordStage: annualReturn?.approvalWorkflow?.currentStage,
      sections: Object.fromEntries(Object.entries(client.data.annualReturn.filings[annualYear]?.approvalWorkflow?.sections || {}).map(([title, meta]) => [
        title,
        {
          status: meta?.status || '',
          managerStatus: meta?.managerStatus || '',
          complianceStatus: meta?.complianceStatus || '',
          reviewerRole: meta?.reviewerRole || ''
        }
      ]))
    });
    res.json({ ok: true, client, annualReturn: client.data.annualReturn.filings[annualYear], annualReturnRecord: annualReturn, managerNotification, poApprovalNotification });
  } catch (err) {
    console.error('Annual return update error', err);
    const message = err?.name === 'ValidationError'
      ? err.message
      : err?.code === 11000
        ? 'Annual return record already exists for this client and year.'
        : 'Unable to save annual return data.';
    res.status(500).json({ error: message });
  }
};

exports.updateClientApproval = async (req, res) => {
  const status = normalizeApprovalStatus(req.body.status || req.body.approvalStatus);
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Approval status must be APPROVED or REJECTED' });
  }
  const approvalRecordId = String(req.body.approvalRecordId || '').trim();
  const remarks = String(req.body.remarks || '').trim();
  if (!remarks) {
    return res.status(400).json({ error: `${status === 'APPROVED' ? 'Approval note' : 'Rejection reason'} is required` });
  }
  if (remarks.length > 250) {
    return res.status(400).json({ error: 'Decision note cannot exceed 250 characters' });
  }
  const approvalRecord = mongoose.Types.ObjectId.isValid(approvalRecordId)
    ? await PendingApproval.findById(approvalRecordId)
    : null;
  const source = String(req.body.source || approvalRecord?.source || 'crm').trim() || 'crm';
  const sourceClientId = String(req.body.sourceClientId || req.params.id || approvalRecord?.sourceClientId || '').trim();
  const rawApprovalPayload = req.body.payload || approvalRecord?.payload?.payload || null;
  const shouldBuildApprovalPayload = isPlainObject(rawApprovalPayload)
    || isPlainObject(req.body.data)
    || isPlainObject(req.body.adminControls);
  const approvalFields = shouldBuildApprovalPayload
    ? buildClientApprovalPayload({
        ...req.body,
        source,
        sourceClientId,
        uniqueId: req.body.uniqueId || approvalRecord?.uniqueId || '',
        payload: rawApprovalPayload || req.body.payload || {}
      }, status, req.user?._id, remarks)
    : null;

  const client = mongoose.Types.ObjectId.isValid(req.params.id)
    ? await Client.findById(req.params.id)
    : null;

  if (client && status === 'APPROVED') {
    const complianceReview = await ClientComplianceReview.findOne({ client: client._id }).lean();
    const sections = Array.isArray(complianceReview?.sections) ? complianceReview.sections : [];
    const reviewComplete = sections.length === 9
      && sections.every((section) => ['VERIFIED', 'NOT_APPLICABLE'].includes(section.status))
      && complianceReview?.status === 'APPROVED';
    if (!reviewComplete) return res.status(409).json({ error: 'Complete all Compliance Verification tabs before approving this Client Master' });
  }

  if (!client) {
    const createdClient = await Client.create({
      adminControls: approvalFields?.adminControls || { approvalStatus: status },
      data: approvalFields?.data || {
        approvalMeta: {
          status,
          source,
          actionBy: req.user?._id,
          actionAt: new Date(),
          remarks
        }
      },
      workflowStatus: 'draft',
      createdBy: req.user?._id
    });

    if (approvalRecord) {
      await PendingApproval.findByIdAndUpdate(approvalRecord._id, {
        approvalStatus: status,
        nextReminderAt: null,
        reminderFlag: 'GREEN',
        greenFlagAt: new Date(),
        redFlagAt: null,
        greenFlagDeadline: null,
        actionBy: req.user?._id,
        actionAt: new Date(),
        remarks
      });
    } else {
      await PendingApproval.findOneAndUpdate(
        pendingApprovalFilter({
          id: req.params.id,
          source,
          uniqueId: req.body.uniqueId,
          clientName: req.body.clientName
        }),
        {
          approvalStatus: status,
          nextReminderAt: null,
          reminderFlag: 'GREEN',
          greenFlagAt: new Date(),
          redFlagAt: null,
          greenFlagDeadline: null,
          actionBy: req.user?._id,
          actionAt: new Date(),
          remarks
        }
      );
    }

    const notification = await notifyClientApprovalDecision({ record: approvalRecord || req.body, client: createdClient, status, remarks, reviewer: req.user })
      .catch((error) => {
        console.error('Client approval decision email failed', error);
        return { sent: false, reason: error.message || 'email_failed' };
      });
    return res.json({ ok: true, client: createdClient, notification });
  }

  client.adminControls = approvalFields
    ? { ...(client.adminControls || {}), ...approvalFields.adminControls }
    : { ...(client.adminControls || {}), approvalStatus: status };

  client.data = {
    ...(client.data || {}),
    ...(approvalFields?.data || {}),
    approvalMeta: {
      status,
      source,
      actionBy: req.user?._id,
      actionAt: new Date(),
      remarks
    }
  };

  client.markModified('data');
  await client.save();

  if (approvalRecord) {
    await PendingApproval.findByIdAndUpdate(approvalRecord._id, {
      approvalStatus: status,
      nextReminderAt: null,
      reminderFlag: 'GREEN',
      greenFlagAt: new Date(),
      redFlagAt: null,
      greenFlagDeadline: null,
      actionBy: req.user?._id,
      actionAt: new Date(),
      remarks
    });
  } else {
    await PendingApproval.findOneAndUpdate(
      pendingApprovalFilter({
        id: req.params.id,
        source: req.body.source || 'crm',
        uniqueId: req.body.uniqueId,
        clientName: req.body.clientName
      }),
      {
        approvalStatus: status,
        nextReminderAt: null,
        reminderFlag: 'GREEN',
        greenFlagAt: new Date(),
        redFlagAt: null,
        greenFlagDeadline: null,
        actionBy: req.user?._id,
        actionAt: new Date(),
        remarks
      }
    );
  }

  const notification = await notifyClientApprovalDecision({ record: approvalRecord || req.body, client, status, remarks, reviewer: req.user })
    .catch((error) => {
      console.error('Client approval decision email failed', error);
      return { sent: false, reason: error.message || 'email_failed' };
    });
  res.json({ ok: true, client, notification });
};

exports.approveAllPendingClients = async (req, res) => {
  const remarks = String(req.body.remarks || 'Bulk approved').trim();
  const records = await PendingApproval.find({ type: 'client', approvalStatus: 'PENDING' });
  let approved = 0;
  const failures = [];

  for (const record of records) {
    try {
      const approvedClient = await applyClientApprovalStatus(record, 'APPROVED', req.user?._id, remarks);
      record.approvalStatus = 'APPROVED';
      record.nextReminderAt = null;
      record.reminderFlag = 'GREEN';
      record.greenFlagAt = new Date();
      record.redFlagAt = null;
      record.greenFlagDeadline = null;
      record.actionBy = req.user?._id;
      record.actionAt = new Date();
      record.remarks = remarks;
      await record.save();
      await notifyClientApprovalDecision({ record, client: approvedClient, status: 'APPROVED', remarks, reviewer: req.user })
        .catch((error) => console.error('Client bulk approval decision email failed', error));
      approved += 1;
    } catch (err) {
      failures.push({
        id: record._id,
        clientName: record.clientName,
        error: err.message || 'Unable to approve client'
      });
    }
  }

  res.json({
    ok: failures.length === 0,
    approved,
    failed: failures.length,
    failures
  });
};

exports.__test = {
  buildClientApprovalPayload,
  mergeAssignedServiceCpcbData
};
