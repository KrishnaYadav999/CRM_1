const AnnualReturn = require('../models/AnnualReturn');
const Client = require('../models/Client');

function readClientData(client) {
  return client?.data && typeof client.data === 'object' ? client.data : {};
}

function getClientKey(client) {
  const data = readClientData(client);
  return String(client?._id || data.importMeta?.ccpClientId || data.importMeta?.uniqueId || '').trim();
}

function getClientName(client) {
  const data = readClientData(client);
  return String(data.basic?.clientLegalName || data.basic?.tradeName || 'Untitled client').trim();
}

function mapClientFiling(client, annualYear, filing = {}) {
  const data = readClientData(client);
  const basic = data.basic || {};
  return {
    _id: `client-${getClientKey(client)}-${annualYear}`,
    client: client._id,
    clientKey: getClientKey(client),
    annualYear,
    clientName: getClientName(client),
    piboCategory: basic.piboCategory || '',
    eprCategory: basic.eprCategory || '',
    currentSpoc: filing.annual?.currentSpoc || '',
    previousSpoc: filing.annual?.previousSpoc || '',
    status: filing.status || 'draft',
    activeTab: filing.activeTab || '',
    activeSection: filing.activeSection || '',
    draft: filing.draft || {},
    basicInfo: filing.basicInfo || {},
    financials: filing.financials || {},
    data: filing.data || {},
    brandOwner: filing.brandOwner || {},
    importer: filing.importer || {},
    annual: filing.annual || {},
    approvalWorkflow: filing.approvalWorkflow || {},
    clientData: data,
    adminControls: client.adminControls || {},
    savedAt: filing.savedAt || data.annualReturn?.lastSavedAt || client.updatedAt,
    updatedAt: filing.savedAt || data.annualReturn?.lastSavedAt || client.updatedAt
  };
}

function readWorkflowStage(workflow = {}) {
  const currentStage = String(workflow.currentStage || '').toLowerCase();
  const status = String(workflow.status || '').toLowerCase();
  if (currentStage === 'complete' || status === 'compliance_approved') return 4;
  if (currentStage === 'compliance' || status === 'compliance_pending') return 3;
  if (currentStage === 'manager' || status === 'manager_pending' || status === 'compliance_rejected') return 2;
  return 1;
}

function countReviewedWorkflowParts(workflow = {}) {
  const sections = workflow?.sections && typeof workflow.sections === 'object' && !Array.isArray(workflow.sections)
    ? workflow.sections
    : {};
  const reviewedParts = new Set();

  Object.entries(sections).forEach(([title, meta]) => {
    const part = String(title || '').trim().match(/^Part\s+([A-Z])/i)?.[1]?.toUpperCase();
    if (!part) return;
    const managerStatus = String(meta?.managerStatus || meta?.status || '').trim().toLowerCase();
    const complianceStatus = String(meta?.complianceStatus || '').trim().toLowerCase();
    if (['approved', 'rejected'].includes(managerStatus) || ['approved', 'rejected'].includes(complianceStatus)) {
      reviewedParts.add(part);
    }
  });

  return reviewedParts.size;
}

function workflowUpdatedAt(row = {}) {
  const workflow = row.approvalWorkflow || {};
  const sectionTimes = Object.values(workflow.sections || {})
    .map((meta) => Date.parse(meta?.updatedAt || meta?.managerReviewedAt || meta?.complianceReviewedAt || ''))
    .filter(Number.isFinite);
  const historyTimes = Array.isArray(workflow.history)
    ? workflow.history.map((item) => Date.parse(item?.at || '')).filter(Number.isFinite)
    : [];
  return Math.max(
    Date.parse(workflow.updatedAt || '') || 0,
    Date.parse(row.updatedAt || row.savedAt || '') || 0,
    ...sectionTimes,
    ...historyTimes,
    0
  );
}

function shouldUseClientFiling(existing = {}, candidate = {}) {
  const existingWorkflow = existing.approvalWorkflow || {};
  const candidateWorkflow = candidate.approvalWorkflow || {};
  const existingStage = readWorkflowStage(existingWorkflow);
  const candidateStage = readWorkflowStage(candidateWorkflow);
  if (candidateStage !== existingStage) return candidateStage > existingStage;

  const existingReviewed = countReviewedWorkflowParts(existingWorkflow);
  const candidateReviewed = countReviewedWorkflowParts(candidateWorkflow);
  if (candidateReviewed !== existingReviewed) return candidateReviewed > existingReviewed;

  return workflowUpdatedAt(candidate) > workflowUpdatedAt(existing);
}

exports.listAnnualReturns = async (req, res) => {
  const annualReturns = await AnnualReturn.find()
    .populate('client', 'data adminControls')
    .populate('updatedBy', 'name email role')
    .sort({ updatedAt: -1 })
    .lean();
  const index = new Map();
  annualReturns.forEach((row) => index.set(`${row.clientKey}:${row.annualYear}`, row));

  const clients = await Client.find({ 'data.annualReturn.filings': { $exists: true } })
    .select('data adminControls updatedAt')
    .lean();
  clients.forEach((client) => {
    const filings = client.data?.annualReturn?.filings || {};
    Object.entries(filings).forEach(([annualYear, filing]) => {
      const row = mapClientFiling(client, annualYear, filing);
      const key = `${row.clientKey}:${row.annualYear}`;
      if (!index.has(key) || shouldUseClientFiling(index.get(key), row)) index.set(key, row);
    });
  });

  const mergedRows = [...index.values()].sort((a, b) => new Date(b.updatedAt || b.savedAt || 0) - new Date(a.updatedAt || a.savedAt || 0));
  res.json({ ok: true, annualReturns: mergedRows });
};
