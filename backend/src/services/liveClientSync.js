const crypto = require('crypto');
const Client = require('../models/Client');
const { ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');

const BATCH_SIZE = 10;
const EXCLUDED_VISIBILITY = new Set(['DISCONTINUED', 'SUSPENDED']);
const BASE64_DATA_URI = /^data:[^;,]+;base64,/i;

function visibilityStatus(client = {}) {
  return String(client.adminControls?.visibilityStatus || client.data?.importMeta?.visibilityStatus || 'LIVE').trim().toUpperCase();
}

function isLiveApplication(client = {}) {
  return !EXCLUDED_VISIBILITY.has(visibilityStatus(client)) && client.data?.importMeta?.approvalOverride !== true;
}

function firstAnnualReturnYear(client = {}) {
  const data = client.data || {};
  const annual = data.annualReturn || {};
  const filingYears = annual.filings && typeof annual.filings === 'object' ? Object.keys(annual.filings) : [];
  return [
    data.basic?.firstAnnualReturnYear,
    data.basic?.annualReturnYear,
    data.basic?.firstAnnualYear,
    data.firstAnnualReturnYear,
    data.annualReturnYear,
    annual.firstAnnualReturnYear,
    annual.firstAnnualYear,
    annual.annualReturnYear,
    annual.selectedYear,
    annual.lastSavedYear,
    filingYears[0],
    client.firstAnnualReturnYear,
    client.annualReturnYear,
    client.annualYear,
    client.returnYear
  ].find((value) => String(value || '').trim()) || '';
}

function uniqueIdOf(client = {}) {
  return String(client.data?.importMeta?.uniqueId || client.data?.importMeta?.leadNumber || '').trim();
}

function buildClientBatches(clients = [], batchSize = BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < clients.length; index += batchSize) batches.push(clients.slice(index, index + batchSize));
  return batches;
}

function plainValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function pruneEmptyAndRejectBase64(value, path = 'client') {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (BASE64_DATA_URI.test(trimmed)) throw new Error(`Base64 file data is not allowed at ${path}`);
    return trimmed || undefined;
  }
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const rows = value.map((item, index) => pruneEmptyAndRejectBase64(item, `${path}[${index}]`)).filter((item) => item !== undefined);
    return rows.length ? rows : undefined;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [key, pruneEmptyAndRejectBase64(item, `${path}.${key}`)]).filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function mapClientForCcp(source) {
  const client = plainValue(source);
  const uniqueId = uniqueIdOf(client);
  if (!uniqueId) throw new Error('CRM Unique ID is required for CCP synchronization');
  const crmClientId = String(client._id || client.id || '').trim();
  const importMeta = pruneEmptyAndRejectBase64({
    ...(client.data?.importMeta || {}),
    uniqueId,
    ccpClientId: client.data?.importMeta?.ccpClientId || uniqueId,
    leadNumber: client.data?.importMeta?.leadNumber || '',
    crmClientId
  }, 'data.importMeta');
  const data = pruneEmptyAndRejectBase64({ ...(client.data || {}), importMeta }, 'data');
  return pruneEmptyAndRejectBase64({
    data,
    adminControls: client.adminControls,
    selectedLead: client.selectedLead,
    workflowStatus: client.workflowStatus,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt
  });
}

async function canonicalLiveApplications() {
  const clients = await Client.find({ 'data.importMeta.approvalOverride': { $ne: true } })
    .populate('adminControls.assignedTo', 'name email role crmUserId ccpUserId')
    .lean();
  return clients.filter(isLiveApplication).sort((left, right) => uniqueIdOf(left).localeCompare(uniqueIdOf(right)));
}

async function readSyncMetrics() {
  const liveClients = await canonicalLiveApplications();
  const liveApplicationsCount = liveClients.length;
  const annualReturnApplicableCount = liveClients.filter((client) => firstAnnualReturnYear(client)).length;
  const syncSourceCount = liveClients.length;
  if (syncSourceCount !== liveApplicationsCount) {
    const error = new Error(`Synchronization aborted: source count ${syncSourceCount} does not match Live Applications count ${liveApplicationsCount}.`);
    error.statusCode = 409;
    throw error;
  }
  return { liveClients, liveApplicationsCount, annualReturnApplicableCount, syncSourceCount };
}

async function requestCcp(method, resource, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CCP_FETCH_TIMEOUT_MS) || 30000);
  try {
    const response = await fetch(ccpApiUrl(`ccp/${resource}`), {
      method,
      headers: ccpHeaders({ json: method !== 'GET' }),
      signal: controller.signal,
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `CCP returned ${response.status}`);
      error.statusCode = response.status;
      error.details = payload.details || payload.errors;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function ensureCredential() {
  const headers = ccpHeaders();
  if (!headers['x-ccp-api-key']) {
    const error = new Error('CCP_SHARED_API_KEY is not configured in the CRM backend.');
    error.statusCode = 503;
    throw error;
  }
}

async function previewSync() {
  ensureCredential();
  const metrics = await readSyncMetrics();
  return {
    syncRunId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    liveApplicationsCount: metrics.liveApplicationsCount,
    annualReturnApplicableCount: metrics.annualReturnApplicableCount,
    syncSourceCount: metrics.syncSourceCount,
    batchSize: BATCH_SIZE,
    totalBatches: Math.ceil(metrics.syncSourceCount / BATCH_SIZE)
  };
}

function normalizeFailures(payload = [], fallback = []) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((failure, index) => ({
    uniqueId: String(failure.uniqueId || failure.id || fallback[index] || '').trim(),
    error: String(failure.error || failure.message || 'CCP upsert failed')
  }));
}

async function syncBatch({ syncRunId, batchIndex, uniqueIds }) {
  ensureCredential();
  if (!String(syncRunId || '').trim()) throw Object.assign(new Error('syncRunId is required'), { statusCode: 400 });
  const metrics = await readSyncMetrics();
  const requestedIds = Array.isArray(uniqueIds) ? [...new Set(uniqueIds.map(String))].slice(0, BATCH_SIZE) : null;
  const source = requestedIds
    ? metrics.liveClients.filter((client) => requestedIds.includes(uniqueIdOf(client)))
    : metrics.liveClients.slice(Number(batchIndex || 0) * BATCH_SIZE, (Number(batchIndex || 0) + 1) * BATCH_SIZE);
  if (!source.length) throw Object.assign(new Error('No live clients found for this batch'), { statusCode: 400 });

  const clients = [];
  const failedRecords = [];
  source.forEach((client) => {
    try { clients.push(mapClientForCcp(client)); }
    catch (error) { failedRecords.push({ uniqueId: uniqueIdOf(client), error: error.message }); }
  });
  let payload = {};
  if (clients.length) {
    try {
      payload = await requestCcp('POST', 'clients/bulk', {
        clients,
        includeRecords: false,
        expectedTotal: metrics.liveApplicationsCount,
        syncRunId
      });
    } catch (error) {
      if ([401, 403, 404].includes(error.statusCode)) throw error;
      payload = { failures: clients.map((client) => ({ uniqueId: uniqueIdOf(client), error: error.message || 'CCP batch request failed' })) };
    }
  }
  const sentIds = clients.map(uniqueIdOf);
  const remoteFailures = normalizeFailures(payload.failedRecords || payload.failures || payload.errors, sentIds);
  const allFailures = [...failedRecords, ...remoteFailures];
  const successful = Number(payload.successfullyUpserted ?? payload.upserted ?? payload.imported ?? payload.processed ?? (clients.length - remoteFailures.length));
  return {
    ok: allFailures.length === 0,
    syncRunId,
    batchIndex: Number(batchIndex || 0),
    batchSize: source.length,
    expectedLiveCount: metrics.liveApplicationsCount,
    syncSourceCount: metrics.syncSourceCount,
    successfullyUpserted: Math.max(0, successful),
    processed: source.length,
    processedIds: source.map(uniqueIdOf),
    failedRecords: allFailures
  };
}

function extractCcpIds(payload = {}) {
  const rows = payload.identities || payload.uniqueIds || payload.crmUniqueIds || payload.clients || payload.records || payload.data?.clients || [];
  return [...new Set((Array.isArray(rows) ? rows : []).map((row) => String(
    typeof row === 'string' ? row : row.uniqueId || row.crmUniqueId || row.data?.importMeta?.uniqueId || row.data?.importMeta?.ccpClientId || ''
  ).trim()).filter(Boolean))];
}

async function reconcileSync({ syncRunId, startedAt: runStartedAt, failedRecords = [] }) {
  ensureCredential();
  const metrics = await readSyncMetrics();
  const payload = await requestCcp('GET', `clients/reconciliation?syncRunId=${encodeURIComponent(syncRunId || '')}`);
  const expectedIds = metrics.liveClients.map(uniqueIdOf);
  const ccpIds = extractCcpIds(payload);
  const reportedMissing = payload.missingCrmIds || payload.missingCRMIDs || payload.missingIds;
  const hasIdentityEvidence = ccpIds.length > 0 || Array.isArray(reportedMissing);
  const missingCrmIds = Array.isArray(reportedMissing) ? reportedMissing.map(String) : expectedIds.filter((id) => !ccpIds.includes(id));
  if (!hasIdentityEvidence) missingCrmIds.push(...expectedIds.filter((id) => !missingCrmIds.includes(id)));
  const unexpectedCcpIds = Array.isArray(payload.unexpectedCcpIds || payload.unexpectedCCPIDs)
    ? (payload.unexpectedCcpIds || payload.unexpectedCCPIDs).map(String)
    : ccpIds.filter((id) => !expectedIds.includes(id));
  const failures = [...(Array.isArray(failedRecords) ? failedRecords : []), ...normalizeFailures(payload.failedRecords || payload.failures)];
  const ccpStoredCount = Number(payload.ccpStoredCount ?? payload.storedCount ?? payload.total ?? payload.count ?? ccpIds.length);
  return {
    ok: missingCrmIds.length === 0 && failures.length === 0 && metrics.syncSourceCount === metrics.liveApplicationsCount,
    syncRunId,
    expectedLiveCount: metrics.liveApplicationsCount,
    annualReturnApplicableCount: metrics.annualReturnApplicableCount,
    syncSourceCount: metrics.syncSourceCount,
    successfullyUpserted: Number(payload.successfullyUpserted ?? payload.upserted ?? metrics.syncSourceCount - failures.length),
    ccpStoredCount,
    missingCrmIds,
    unexpectedCcpIds,
    failedRecords: failures,
    totalDurationMs: Number(payload.totalDurationMs || 0) || Math.max(0, Date.now() - (Date.parse(runStartedAt) || Date.now()))
  };
}

module.exports = {
  BATCH_SIZE,
  visibilityStatus,
  isLiveApplication,
  firstAnnualReturnYear,
  uniqueIdOf,
  buildClientBatches,
  pruneEmptyAndRejectBase64,
  mapClientForCcp,
  readSyncMetrics,
  previewSync,
  syncBatch,
  extractCcpIds,
  reconcileSync
};
