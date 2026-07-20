const mongoose = require('mongoose');
const Client = require('../models/Client');
const Quotation = require('../models/Quotation');
const AnnualReturn = require('../models/AnnualReturn');
const PendingApproval = require('../models/PendingApproval');
const { notifyManagerAnnualSubmitted } = require('../services/annualReviewNotifications');
const { queuePendingClientReminder } = require('../services/pendingApprovalNotifications');
const { mapQuotationPendingApprovalRow, hydrateCcpQuotationCreators } = require('./quotationController');
const { getVisibleUserScope, ownerFilter } = require('../utils/visibilityScope');
const { ccpApiBaseUrl, ccpHeaders } = require('../utils/ccpConfig');

const CCP_FETCH_TIMEOUT_MS = Number(process.env.CCP_FETCH_TIMEOUT_MS) || 15000;

function ccpBaseUrls() {
  return [ccpApiBaseUrl()]
    .map((url) => String(url || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function normalizeApprovalStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  return ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : '';
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

async function fetchCcpClients() {
  for (const baseUrl of ccpBaseUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CCP_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/ccp/clients`, { headers: ccpHeaders(), signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      return normalizeCollection(payload, 'clients');
    } catch {
      // Try the next configured CCP URL before giving up.
    } finally {
      clearTimeout(timeout);
    }
  }
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

function mapCcpPendingClient(client) {
  const lookup = buildValueLookup(client);
  const data = client.data || {};
  const importMeta = data.importMeta || {};
  const basic = data.basic || {};
  const selectedLead = client.selectedLead || {};
  const parts = readApprovalDateParts(client);
  const approvalStatus = normalizeApprovalStatus(
    client.adminControls?.approvalStatus
    || pickLookup(lookup, ['Approval Status'])
    || 'PENDING'
  ) || 'PENDING';

  const rawImportCreator = String(importMeta.createdBy || '').trim();
  const importCreatorIsId = /^[a-f\d]{24}$/i.test(rawImportCreator);
  const createdBy = client.leadCreatedBy
    || selectedLead.importedCreatedBy
    || selectedLead.createdBy?.name
    || selectedLead.createdBy?.email
    || client.createdByName
    || client.createdBy?.name
    || client.createdBy?.email
    || importMeta.createdByName
    || (!importCreatorIsId ? rawImportCreator : '')
    || client.createdByEmail
    || 'CCP User';

  return {
    id: client._id || client.id || importMeta.uniqueId || pickLookup(lookup, ['Unique ID', 'Client ID']),
    source: 'ccp',
    uniqueId: importMeta.uniqueId || pickLookup(lookup, ['Unique ID', 'UniqueId', 'Client ID']),
    clientName: basic.clientLegalName || basic.tradeName || selectedLead.company || pickLookup(lookup, ['Client Name', 'Client Legal Name', 'Legal Name', 'Company Name', 'Name']) || 'Untitled client',
    approvalStatus,
    piboCategory: basic.piboCategory || selectedLead.piboCategory || pickLookup(lookup, ['PIBO Category', 'PIBO']) || '-',
    eprCategory: basic.eprCategory || selectedLead.eprCategory || pickLookup(lookup, ['EPR Category', 'EPR']) || '-',
    createdBy,
    requestDate: parts.date,
    requestTime: parts.time,
    payload: client
  };
}

function isDemoCreator(value) {
  return /^demo(?:\s+demo)?$/i.test(String(value || '').trim());
}

async function hydrateCcpClientLeadCreators(clients = []) {
  if (!clients.length) return clients;
  try {
    const db = mongoose.connection.useDb(String(process.env.CCP_DB_NAME || 'ccp').trim(), { useCache: true });
    const ids = clients.map((client) => String(client._id || client.id || '')).filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const storedClients = ids.length ? await db.collection('clients').find({ _id: { $in: ids } }).toArray() : [];
    const storedById = new Map(storedClients.map((client) => [String(client._id), client]));
    const leadIds = storedClients.map((client) => client.selectedLead).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    const leadNumbers = storedClients.map((client) => String(client.data?.importMeta?.leadNumber || '').trim()).filter(Boolean);
    const leadQuery = [];
    if (leadIds.length) leadQuery.push({ _id: { $in: leadIds } });
    if (leadNumbers.length) leadQuery.push({ sourceLeadId: { $in: leadNumbers } });
    const leads = leadQuery.length ? await db.collection('leads').find({ $or: leadQuery }).toArray() : [];
    const leadsById = new Map(leads.map((lead) => [String(lead._id), lead]));
    const leadsByNumber = new Map(leads.map((lead) => [String(lead.sourceLeadId || '').trim(), lead]));
    const userIds = leads.map((lead) => lead.createdBy).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    const users = userIds.length ? await db.collection('users').find({ _id: { $in: userIds } }).project({ name: 1, email: 1 }).toArray() : [];
    const usersById = new Map(users.map((user) => [String(user._id), String(user.name || user.email || '').trim()]));

    clients.forEach((client) => {
      const stored = storedById.get(String(client._id || client.id || '')) || {};
      const lead = leadsById.get(String(stored.selectedLead || '')) || leadsByNumber.get(String(stored.data?.importMeta?.leadNumber || '').trim()) || {};
      const originalCreator = String(lead.importedCreatedBy || usersById.get(String(lead.createdBy || '')) || lead.createdByEmail || '').trim();
      const assignedName = String(lead.assignedTo?.name || lead.assignedToText || lead.assignedToEmail || '').trim();
      client.leadCreatedBy = isDemoCreator(originalCreator) && assignedName ? assignedName : originalCreator;
    });
  } catch (error) {
    console.warn('[CCP client lead creator hydration] skipped', { error: error.message });
  }
  return clients;
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
  return String(value.name || value.email || value.ccpUserId || '').trim();
}

function normalizeAdminControls(adminControls = {}) {
  const normalized = isPlainObject(adminControls) ? { ...adminControls } : {};
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
    || client?.data?.importMeta?.ccpClientId
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

function buildCcpClientApprovalPayload(body = {}, status, userId, remarks = '') {
  const ccpPayload = isPlainObject(body.payload) ? body.payload : {};
  const payloadData = isPlainObject(ccpPayload.data) ? ccpPayload.data : {};
  const payloadImportMeta = isPlainObject(payloadData.importMeta) ? payloadData.importMeta : {};
  const payloadAdminControls = isPlainObject(ccpPayload.adminControls) ? ccpPayload.adminControls : {};
  const adminControls = normalizeAdminControls(payloadAdminControls);
  const assignedToLabel = readAssignedToLabel(payloadAdminControls.assignedTo);
  const uniqueId = String(body.uniqueId || payloadImportMeta.uniqueId || '').trim();
  const ccpClientId = String(body.sourceClientId || ccpPayload._id || ccpPayload.id || '').trim();
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
        ccpClientId,
        approvalOverride: true
      },
      approvalMeta: {
        status,
        source: String(body.source || 'ccp').trim() || 'ccp',
        actionBy: userId,
        actionAt: new Date(),
        remarks
      }
    }
  };
}

function mergePendingClients(localRows, ccpRows) {
  const merged = [];
  const indexByKey = new Map();

  [...ccpRows, ...localRows].forEach((row) => {
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
  if (status === 'PENDING') setOnInsert.nextReminderAt = new Date();
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
  const ccpApprovalBody = {
    ...(record.payload || {}),
    sourceClientId,
    uniqueId: record.uniqueId || record.payload?.uniqueId || '',
    payload: record.payload?.payload,
    source: record.source
  };

  if (client) {
    const ccpFields = record.source === 'ccp'
      ? buildCcpClientApprovalPayload(ccpApprovalBody, status, userId, remarks)
      : null;
    client.adminControls = ccpFields
      ? { ...(client.adminControls || {}), ...ccpFields.adminControls }
      : { ...(client.adminControls || {}), approvalStatus: status };
    client.data = {
      ...(client.data || {}),
      ...(ccpFields?.data || {}),
      approvalMeta: {
        status,
        source: record.source,
        actionBy: userId,
        actionAt: new Date(),
        remarks
      }
    };
    client.markModified('data');
    await client.save();
    return client;
  }

  if (record.source === 'ccp') {
    const ccpFields = buildCcpClientApprovalPayload(ccpApprovalBody, status, userId, remarks);
    return Client.create({
      adminControls: ccpFields.adminControls,
      data: ccpFields.data,
      workflowStatus: 'draft',
      createdBy: userId
    });
  }

  return null;
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
    requestTime: record.requestTime || payload.requestTime || '-'
  };
}

function mapClientPendingApprovalRow(client, createdByLabel = 'CRM User') {
  const parts = approvalDateParts(client.createdAt || new Date());
  const data = client.data || {};

  return {
    id: client._id,
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
    .lean();

  return {
    pendingClients: records.filter((record) => record.type === 'client').map(mapPendingApprovalRecord),
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
    'data.importMeta.approvalOverride': { $ne: true },
    ...ownerFilter(scope, 'createdBy', 'adminControls.assignedTo', [
      'data.importMeta.assignedTo'
    ])
  })
    .populate('selectedLead', 'leadCode company status emails mobileNo1 piboCategory eprCategory addressLine1 addressLine2 addressLine3 state city pinCode contactPerson designation')
    .populate('adminControls.assignedTo', 'name email role avatarUrl')
    .sort({ createdAt: -1 });
  res.json({ ok: true, clients });
};

exports.listPendingApprovals = async (req, res) => {
  const startedAt = Date.now();
  const storedFallback = await readStoredPendingApprovals();
  const [clientsResult, ccpClientsResult, quotationsResult] = await Promise.allSettled([
    Client.find()
      .populate('selectedLead', 'leadCode company piboCategory eprCategory contactPerson mobileNo1 importedCreatedBy')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
    fetchCcpClients(),
    Quotation.find({ status: { $in: ['draft', 'submitted', 'sent'] } })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean()
  ]);
  const allClients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
  const ccpClients = ccpClientsResult.status === 'fulfilled' ? ccpClientsResult.value : [];
  await hydrateCcpClientLeadCreators(ccpClients);
  const quotations = quotationsResult.status === 'fulfilled' ? quotationsResult.value : [];
  await hydrateCcpQuotationCreators(quotations);
  const clients = allClients.filter((client) => {
    const status = normalizeApprovalStatus(client.adminControls?.approvalStatus) || 'PENDING';
    return status === 'PENDING' && client.data?.importMeta?.approvalOverride !== true;
  });
  const resolvedClientKeys = new Set();
  allClients.forEach((client) => {
    const status = normalizeApprovalStatus(client.adminControls?.approvalStatus) || 'PENDING';
    if (status === 'PENDING') return;
    const row = {
      id: client.data?.importMeta?.ccpClientId || client._id,
      uniqueId: client.data?.importMeta?.uniqueId || client.selectedLead?.leadCode || '',
      clientName: readClientName(client)
    };
    getPendingClientKeys(row).forEach((key) => resolvedClientKeys.add(key));
  });

  const pendingClients = clients.map((client) => {
    const parts = approvalDateParts(client.createdAt);
    const approvalStatus = normalizeApprovalStatus(client.adminControls?.approvalStatus) || 'PENDING';
    return {
      id: client._id,
      source: 'crm',
      uniqueId: client.data?.importMeta?.uniqueId || client.selectedLead?.leadCode || '',
      clientName: readClientName(client),
      approvalStatus,
      piboCategory: client.data?.basic?.piboCategory || client.selectedLead?.piboCategory || '-',
      eprCategory: client.data?.basic?.eprCategory || client.selectedLead?.eprCategory || '-',
      createdBy: readCreatedBy(client),
      requestDate: parts.date,
      requestTime: parts.time
    };
  });
  const pendingCcpClients = ccpClients
    .map(mapCcpPendingClient)
    .filter((client) => normalizeApprovalStatus(client.approvalStatus) === 'PENDING')
    .filter((client) => !getPendingClientKeys(client).some((key) => resolvedClientKeys.has(key)));

  const clientQuotationRows = clients.filter(hasQuotationData).map((client) => {
    const validation = client.data?.validation || {};
    return {
      id: client._id,
      userName: readCreatedBy(client),
      leadGeneratedBy: client.selectedLead?.importedCreatedBy || readCreatedBy(client),
      companyName: readClientName(client),
      contactPerson: client.data?.authorised?.name || client.selectedLead?.contactPerson || '-',
      mobileNo1: client.data?.otp?.mobile || client.selectedLead?.mobileNo1 || '-',
      quotationDate: validation.quotationDate || '-',
      service: client.data?.basic?.servicesOffered || '-',
      category: client.data?.basic?.eprCategory || client.selectedLead?.eprCategory || '-',
      piboCategory: client.data?.basic?.piboCategory || client.selectedLead?.piboCategory || '-',
      basicAmount: validation.basicAmount || validation.amount || '-',
      approvalStatus: normalizeApprovalStatus(client.adminControls?.approvalStatus) || 'PENDING',
      approvalType: validation.quotationNumber ? 'UPDATE' : 'CREATE',
      createdBy: readCreatedBy(client)
    };
  });
  const quotationRows = quotations.map((quotation) => mapQuotationPendingApprovalRow(quotation, 'CREATE'));
  const pendingQuotations = [...quotationRows, ...clientQuotationRows];

  const pendingClientRows = mergePendingClients(pendingClients, pendingCcpClients);
  const responseClients = pendingClientRows.length ? pendingClientRows : storedFallback.pendingClients;
  const responseQuotations = pendingQuotations.length ? pendingQuotations : storedFallback.pendingQuotations;

  backgroundSyncPendingApprovals(pendingClientRows, pendingQuotations);

  res.json({
    ok: true,
    pendingClients: responseClients,
    pendingQuotations: responseQuotations,
    debug: {
      source: pendingClientRows.length || pendingQuotations.length ? 'live' : 'stored-fallback',
      ms: Date.now() - startedAt,
      clientsQueryOk: clientsResult.status === 'fulfilled',
      ccpQueryOk: ccpClientsResult.status === 'fulfilled',
      quotationsQueryOk: quotationsResult.status === 'fulfilled',
      ccpRows: Array.isArray(ccpClients) ? ccpClients.length : 0,
      storedClients: storedFallback.pendingClients.length,
      storedQuotations: storedFallback.pendingQuotations.length
    }
  });
};

exports.createClient = async (req, res) => {
  const workflowStatus = req.body.workflowStatus === 'submitted' ? 'submitted' : 'draft';
  const { data, adminControls } = normalizeClientRequestPayload(req.body);
  const selectedLead = readSelectedLeadId(req.body.selectedLead);

  if (workflowStatus === 'submitted' && !data?.basic?.clientLegalName) {
    return res.status(400).json({ error: 'Client Legal Name is required before submit' });
  }

  const client = await Client.create({
    selectedLead,
    adminControls,
    data,
    workflowStatus,
    createdBy: req.user?._id
  });

  await queueCreatedClientApproval(client, req.user);

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

  const client = await Client.create({
    selectedLead,
    adminControls,
    data,
    workflowStatus,
    createdBy: userId
  });
  await queueCreatedClientApproval(client, row.createdByUser);
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

exports.updateClient = async (req, res) => {
  const workflowStatus = req.body.workflowStatus === 'submitted' ? 'submitted' : 'draft';
  const { data, adminControls } = normalizeClientRequestPayload(req.body);
  const selectedLead = readSelectedLeadId(req.body.selectedLead);

  if (workflowStatus === 'submitted' && !data?.basic?.clientLegalName) {
    return res.status(400).json({ error: 'Client Legal Name is required before submit' });
  }

  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.selectedLead = selectedLead;
  client.adminControls = adminControls;
  client.data = data;
  client.workflowStatus = workflowStatus;
  client.markModified('data');
  await client.save();

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
            { 'data.importMeta.ccpClientId': clientId },
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
            uniqueId: importMeta.uniqueId || clientId,
            ccpClientId: importMeta.ccpClientId || clientId
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
    res.json({ ok: true, client, annualReturn: client.data.annualReturn.filings[annualYear], annualReturnRecord: annualReturn, managerNotification });
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
  const approvalRecord = mongoose.Types.ObjectId.isValid(approvalRecordId)
    ? await PendingApproval.findById(approvalRecordId)
    : null;
  const source = String(req.body.source || approvalRecord?.source || 'ccp').trim() || 'ccp';
  const sourceClientId = String(req.body.sourceClientId || req.params.id || approvalRecord?.sourceClientId || '').trim();
  const ccpPayload = req.body.payload || approvalRecord?.payload?.payload;
  const ccpFields = source === 'ccp'
    ? buildCcpClientApprovalPayload({
        ...req.body,
        source,
        sourceClientId,
        uniqueId: req.body.uniqueId || approvalRecord?.uniqueId || '',
        payload: ccpPayload
      }, status, req.user?._id, remarks)
    : null;

  const client = mongoose.Types.ObjectId.isValid(req.params.id)
    ? await Client.findById(req.params.id)
    : null;

  if (!client) {
    const createdClient = await Client.create({
      adminControls: ccpFields?.adminControls || { approvalStatus: status },
      data: ccpFields?.data || {
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
          actionBy: req.user?._id,
          actionAt: new Date(),
          remarks
        }
      );
    }

    return res.json({ ok: true, client: createdClient });
  }

  client.adminControls = ccpFields
    ? { ...(client.adminControls || {}), ...ccpFields.adminControls }
    : { ...(client.adminControls || {}), approvalStatus: status };

  client.data = {
    ...(client.data || {}),
    ...(ccpFields?.data || {}),
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
        actionBy: req.user?._id,
        actionAt: new Date(),
        remarks
      }
    );
  }

  res.json({ ok: true, client });
};

exports.approveAllPendingClients = async (req, res) => {
  const remarks = String(req.body.remarks || 'Bulk approved').trim();
  const records = await PendingApproval.find({ type: 'client', approvalStatus: 'PENDING' });
  let approved = 0;
  const failures = [];

  for (const record of records) {
    try {
      await applyClientApprovalStatus(record, 'APPROVED', req.user?._id, remarks);
      record.approvalStatus = 'APPROVED';
      record.nextReminderAt = null;
      record.actionBy = req.user?._id;
      record.actionAt = new Date();
      record.remarks = remarks;
      await record.save();
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
  buildCcpClientApprovalPayload
};
