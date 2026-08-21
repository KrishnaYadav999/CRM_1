const mongoose = require('mongoose');
const Client = require('../models/Client');
const SalesData = require('../models/SalesData');
const SalesImportRow = require('../models/SalesImportRow');
const { defaultChecklist, normalizePurchaseRows, reconcilePurchaseRows, checksum } = require('../services/purchaseDataService');
const { notifySalesWorkflow } = require('../services/salesDataNotifications');

const normalizedRole = (user) => String(user?.role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
const isAdmin = (user) => ['admin', 'superadmin'].includes(normalizedRole(user));
const isManager = (user) => normalizedRole(user) === 'manager';
const isCompliance = (user) => normalizedRole(user).includes('compliance');
const canEdit = (user) => isAdmin(user) || (!isManager(user) && !isCompliance(user));
const validYear = (value) => /^20\d{2}-\d{2}$/.test(String(value || '').trim());
const actor = (user) => ({ userId: user?._id, name: user?.name || user?.email || 'CRM User', role: user?.role || '' });
const historyItem = (stage, decision, user, message = '') => ({ stage, decision, message: String(message || '').trim(), by: actor(user), at: new Date() });

async function findClient(value) {
  const id = String(value || '').trim();
  if (mongoose.Types.ObjectId.isValid(id)) {
    const client = await Client.findById(id);
    if (client) return client;
  }
  return Client.findOne({ $or: [{ 'data.importMeta.uniqueId': id }, { 'data.basic.clientLegalName': id }, { 'data.basic.tradeName': id }] });
}

function cleanFile(file = {}) {
  const url = String(file.secureUrl || file.url || '').trim();
  if (!/^https:\/\//i.test(url)) return null;
  return { name: String(file.name || file.originalName || 'file').trim().slice(0, 240), originalName: String(file.originalName || file.name || 'file').trim().slice(0, 240), mimeType: String(file.mimeType || file.type || '').trim().slice(0, 120), size: Math.max(0, Number(file.size || file.bytes) || 0), url, secureUrl: url, publicId: String(file.publicId || '').trim(), uploadedAt: file.uploadedAt || new Date().toISOString() };
}

async function getOrCreate(client, financialYear, user) {
  let sales = await SalesData.findOne({ clientId: client._id, financialYear });
  if (!sales) sales = new SalesData({ clientId: client._id, financialYear, checklist: defaultChecklist(), createdBy: user?._id, updatedBy: user?._id });
  return sales;
}

function resetApprovals(sales) {
  sales.managerVerificationStatus = 'Not Submitted'; sales.managerVerifiedAt = undefined; sales.managerVerifiedBy = undefined; sales.managerVerifiedByName = '';
  sales.complianceVerificationStatus = 'Not Ready'; sales.complianceVerifiedAt = undefined; sales.complianceVerifiedBy = undefined; sales.complianceVerifiedByName = ''; sales.submittedAt = undefined;
}

function readiness(sales = {}) {
  const errors = [];
  if (sales.baseUpload?.importStatus !== 'Imported') errors.push('Sales Base Data is required.');
  if (sales.portalUpload?.importStatus !== 'Imported') errors.push('Sales Portal Upload is required.');
  return { ready: errors.length === 0, errors, warningIssueCount: Number(sales.reconciliation?.warningIssueCount || 0) + Number(sales.reconciliation?.blockingIssueCount || 0) };
}

function calculatedStatus(sales = {}) {
  if (sales.complianceVerificationStatus === 'Approved') return 'Fully Approved';
  if (sales.complianceVerificationStatus === 'Rejected') return 'Compliance Rework Required';
  if (sales.managerVerificationStatus === 'Approved') return 'Manager Approved';
  if (sales.managerVerificationStatus === 'Rejected') return 'Rework Required';
  if (sales.managerVerificationStatus === 'Pending') return 'Manager Review Pending';
  if (sales.baseUpload && sales.portalUpload) return 'Completed';
  if (sales.baseUpload || sales.portalUpload) return 'Partially Uploaded';
  return 'Pending';
}

function payload(sales, user) {
  const object = sales.toObject ? sales.toObject() : sales;
  return { ...object, checklist: defaultChecklist(object.checklist), readiness: readiness(object), calculatedStatus: calculatedStatus(object), permissions: { canEdit: canEdit(user), canManagerReview: isAdmin(user) || isManager(user), canComplianceReview: isAdmin(user) || isCompliance(user) } };
}

async function rowsFor(sales, source) {
  const upload = source === 'base' ? sales.baseUpload : sales.portalUpload;
  return upload?.uploadId ? SalesImportRow.find({ uploadId: upload.uploadId }).lean() : [];
}

async function refreshReconciliation(sales) {
  const [baseRows, portalRows] = await Promise.all([rowsFor(sales, 'base'), rowsFor(sales, 'portal')]);
  sales.reconciliation = reconcilePurchaseRows(baseRows, portalRows);
  sales.calculatedStatus = calculatedStatus(sales);
  sales.markModified('reconciliation');
}

async function submitForManager({ sales, client, user, message }) {
  const duplicate = sales.lastSubmissionVersion === sales.dataVersion && sales.managerVerificationStatus === 'Pending';
  if (!duplicate) {
    const wasSubmitted = Boolean(sales.lastSubmissionVersion);
    sales.managerVerificationStatus = 'Pending'; sales.complianceVerificationStatus = 'Not Ready'; sales.submittedBy = user._id;
    sales.submittedByName = user.name || user.email || 'CRM User'; sales.submittedAt = new Date(); sales.lastSubmissionVersion = sales.dataVersion;
    sales.reviewHistory.push(historyItem('User', wasSubmitted ? 'Revised' : 'Submitted', user, message)); sales.markModified('reviewHistory'); sales.calculatedStatus = calculatedStatus(sales);
    await sales.save();
  }
  const notification = await notifySalesWorkflow({ stage: 'manager_pending', client, sales, actor: user, message, preventDuplicate: duplicate });
  return { duplicate, notification };
}

exports.getSalesData = async (req, res) => {
  try {
    const financialYear = String(req.query.financialYear || '').trim();
    if (!validYear(financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' });
    const sales = await getOrCreate(client, financialYear, req.user); sales.calculatedStatus = calculatedStatus(sales); await sales.save();
    res.json({ ok: true, salesData: payload(sales, req.user) });
  } catch (error) { console.error('Sales Data load failed', error); res.status(500).json({ error: 'Unable to load Sales Data.' }); }
};

exports.importSalesRows = async (req, res) => {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ error: 'Your role cannot replace Sales Excel files.' });
    const source = String(req.params.source || '').toLowerCase();
    if (!['base', 'portal'].includes(source)) return res.status(400).json({ error: 'source must be base or portal.' });
    const financialYear = String(req.body.financialYear || '').trim();
    if (!validYear(financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' });
    const file = cleanFile(req.body.file); if (!file) return res.status(400).json({ error: 'A securely uploaded Excel file is required.' });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length > 10000) return res.status(413).json({ error: 'A maximum of 10,000 rows is supported per import.' });
    let parsed;
    try { parsed = normalizePurchaseRows(rows, source, financialYear); }
    catch (error) { return res.status(422).json({ error: String(error.message || '').replace(/purchase/gi, 'sales'), code: error.code, missingHeaders: error.missingHeaders || [] }); }
    if (parsed.invalidRowCount || parsed.duplicateRowCount) return res.status(422).json({ error: 'Fix invalid or duplicate rows before confirming this import.', upload: parsed, previewRows: parsed.normalizedRows.slice(0, 100), validationErrors: parsed.validationErrors });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' });
    const sales = await getOrCreate(client, financialYear, req.user); const field = source === 'base' ? 'baseUpload' : 'portalUpload'; const previous = sales[field];
    const fileChecksum = checksum({ name: file.name, size: file.size, rows });
    if (previous?.checksum === fileChecksum) return res.json({ ok: true, unchanged: true, salesData: payload(sales, req.user) });
    const uploadId = new mongoose.Types.ObjectId();
    const docs = parsed.normalizedRows.map((row) => ({ ...row, clientId: client._id, financialYear, uploadId, createdBy: req.user._id }));
    if (docs.length) await SalesImportRow.insertMany(docs, { ordered: true });
    sales[field] = { uploadId, source, ...file, checksum: fileChecksum, sheetName: String(req.body.sheetName || '').trim(), headerRowNumber: Number(req.body.headerRowNumber) || 1, totalRows: parsed.totalRows, validRowCount: parsed.validRowCount, warningRowCount: parsed.warningRowCount, invalidRowCount: 0, duplicateRowCount: 0, totalQuantity: parsed.totalQuantity, totalGst: parsed.totalGst, validationErrors: parsed.validationErrors, importStatus: 'Imported', uploadedAt: new Date(), uploadedBy: req.user._id, uploadedByName: req.user.name || req.user.email || 'CRM User' };
    sales.dataVersion = (sales.dataVersion || 0) + 1; resetApprovals(sales); sales.updatedBy = req.user._id;
    sales.reviewHistory.push(historyItem('User', previous ? 'Revised' : 'Uploaded', req.user, `${source === 'base' ? 'Sales Base Data' : 'Sales Portal Data'} ${previous ? 'replaced' : 'uploaded'}.`));
    await refreshReconciliation(sales); sales.markModified(field); sales.markModified('reviewHistory'); await sales.save();
    if (previous?.uploadId) await SalesImportRow.deleteMany({ uploadId: previous.uploadId });
    let automaticSubmission = null;
    if (readiness(sales).ready) automaticSubmission = await submitForManager({ sales, client, user: req.user, message: 'Automatically submitted after both Sales Excel files were imported. Reconciliation differences are included for Manager review.' });
    res.json({ ok: true, upload: sales[field], previewRows: parsed.normalizedRows.slice(0, 100), validationErrors: parsed.validationErrors, summary: sales.reconciliation, salesData: payload(sales, req.user), autoSubmitted: Boolean(automaticSubmission && !automaticSubmission.duplicate), managerNotificationCreated: Boolean(automaticSubmission?.notification?.ok), managerEmailSent: Number(automaticSubmission?.notification?.emailSent || 0) > 0 });
  } catch (error) { console.error('Sales import failed', error); res.status(500).json({ error: 'Unable to import Sales Excel data.' }); }
};

exports.removeSalesImport = async (req, res) => {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ error: 'Your role cannot remove Sales Excel files.' });
    const source = String(req.params.source || '').toLowerCase(); const field = source === 'base' ? 'baseUpload' : source === 'portal' ? 'portalUpload' : '';
    if (!field) return res.status(400).json({ error: 'source must be base or portal.' });
    const financialYear = String(req.query.financialYear || '').trim(); if (!validYear(financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' });
    const sales = await getOrCreate(client, financialYear, req.user); const previous = sales[field]; sales[field] = null; sales.dataVersion = (sales.dataVersion || 0) + 1; resetApprovals(sales);
    sales.reviewHistory.push(historyItem('User', 'Revised', req.user, `${source === 'base' ? 'Sales Base Data' : 'Sales Portal Data'} removed.`)); await refreshReconciliation(sales); sales.markModified(field); sales.markModified('reviewHistory'); await sales.save();
    if (previous?.uploadId) await SalesImportRow.deleteMany({ uploadId: previous.uploadId });
    res.json({ ok: true, salesData: payload(sales, req.user) });
  } catch (error) { console.error('Sales import removal failed', error); res.status(500).json({ error: 'Unable to remove Sales import.' }); }
};

exports.listSalesRows = async (req, res) => {
  try {
    const financialYear = String(req.query.financialYear || '').trim(); const source = String(req.query.source || 'base').toLowerCase();
    if (!validYear(financialYear) || !['base', 'portal'].includes(source)) return res.status(400).json({ error: 'Valid financialYear and source are required.' });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' });
    const sales = await SalesData.findOne({ clientId: client._id, financialYear }); const upload = source === 'base' ? sales?.baseUpload : sales?.portalUpload;
    if (!upload?.uploadId) return res.json({ ok: true, rows: [], pagination: { page: 1, pages: 1, total: 0 } });
    const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25)); const filter = { uploadId: upload.uploadId };
    if (req.query.search) { const escaped = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ entityName: { $regex: escaped, $options: 'i' } }, { gstin: { $regex: escaped, $options: 'i' } }]; }
    const [rows, total] = await Promise.all([SalesImportRow.find(filter).sort({ rowNumber: 1 }).skip((page - 1) * limit).limit(limit).lean(), SalesImportRow.countDocuments(filter)]);
    res.json({ ok: true, rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { console.error('Sales rows load failed', error); res.status(500).json({ error: 'Unable to load Sales rows.' }); }
};

exports.getReconciliation = async (req, res) => {
  try {
    if (!validYear(req.query.financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' }); const sales = await getOrCreate(client, String(req.query.financialYear).trim(), req.user);
    await refreshReconciliation(sales); await sales.save(); res.json({ ok: true, reconciliation: sales.reconciliation, readiness: readiness(sales), calculatedStatus: calculatedStatus(sales) });
  } catch (error) { console.error('Sales reconciliation failed', error); res.status(500).json({ error: 'Unable to calculate Sales reconciliation.' }); }
};

exports.submitSalesData = async (req, res) => {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ error: 'Your role cannot submit Sales Data.' }); const financialYear = String(req.body.financialYear || '').trim();
    if (!validYear(financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' }); const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' });
    const sales = await getOrCreate(client, financialYear, req.user); const ready = readiness(sales); if (!ready.ready) return res.status(422).json({ error: 'Sales Data is not ready for submission.', errors: ready.errors });
    const result = await submitForManager({ sales, client, user: req.user, message: String(req.body.message || '').trim() || 'Sales Data submitted for Manager review.' }); res.json({ ok: true, salesData: payload(sales, req.user), duplicateSubmission: result.duplicate });
  } catch (error) { console.error('Sales submission failed', error); res.status(500).json({ error: 'Unable to submit Sales Data.' }); }
};

exports.managerReview = async (req, res) => {
  try {
    if (!(isAdmin(req.user) || isManager(req.user))) return res.status(403).json({ error: 'Manager permission is required.' }); const decision = String(req.body.decision || '').toUpperCase(); const message = String(req.body.message || '').trim();
    if (!['APPROVED', 'REJECTED'].includes(decision) || (decision === 'REJECTED' && !message)) return res.status(400).json({ error: decision === 'REJECTED' ? 'Rejection comments are required.' : 'Decision must be APPROVED or REJECTED.' });
    const financialYear = String(req.body.financialYear || '').trim(); if (!validYear(financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' }); const sales = await getOrCreate(client, financialYear, req.user);
    if (sales.managerVerificationStatus !== 'Pending') return res.status(409).json({ error: 'Sales Data is not pending Manager review.' });
    sales.managerVerificationStatus = decision === 'APPROVED' ? 'Approved' : 'Rejected'; sales.managerVerifiedAt = new Date(); sales.managerVerifiedBy = req.user._id; sales.managerVerifiedByName = req.user.name || req.user.email || 'Manager'; sales.complianceVerificationStatus = decision === 'APPROVED' ? 'Pending' : 'Not Ready';
    sales.reviewHistory.push(historyItem('Manager', decision === 'APPROVED' ? 'Approved' : 'Rejected', req.user, message)); sales.markModified('reviewHistory'); sales.calculatedStatus = calculatedStatus(sales); await sales.save();
    await notifySalesWorkflow({ stage: decision === 'APPROVED' ? 'compliance_pending' : 'manager_rejected', client, sales, actor: req.user, message }); res.json({ ok: true, salesData: payload(sales, req.user) });
  } catch (error) { console.error('Sales Manager review failed', error); res.status(500).json({ error: 'Unable to complete Manager review.' }); }
};

exports.complianceReview = async (req, res) => {
  try {
    if (!(isAdmin(req.user) || isCompliance(req.user))) return res.status(403).json({ error: 'Compliance permission is required.' }); const decision = String(req.body.decision || '').toUpperCase(); const message = String(req.body.message || '').trim();
    if (!['APPROVED', 'REJECTED'].includes(decision) || (decision === 'REJECTED' && !message)) return res.status(400).json({ error: decision === 'REJECTED' ? 'Rejection comments are required.' : 'Decision must be APPROVED or REJECTED.' });
    const financialYear = String(req.body.financialYear || '').trim(); if (!validYear(financialYear)) return res.status(400).json({ error: 'financialYear must use YYYY-YY.' });
    const client = await findClient(req.params.id); if (!client) return res.status(404).json({ error: 'Client not found' }); const sales = await getOrCreate(client, financialYear, req.user);
    if (sales.managerVerificationStatus !== 'Approved' || sales.complianceVerificationStatus !== 'Pending') return res.status(409).json({ error: 'Manager approval is required before Compliance review.' });
    sales.complianceVerificationStatus = decision === 'APPROVED' ? 'Approved' : 'Rejected'; sales.complianceVerifiedAt = new Date(); sales.complianceVerifiedBy = req.user._id; sales.complianceVerifiedByName = req.user.name || req.user.email || 'Compliance Manager';
    sales.reviewHistory.push(historyItem('Compliance', decision === 'APPROVED' ? 'Approved' : 'Rejected', req.user, message)); sales.markModified('reviewHistory'); sales.calculatedStatus = calculatedStatus(sales); await sales.save();
    await notifySalesWorkflow({ stage: decision === 'APPROVED' ? 'compliance_approved' : 'compliance_rejected', client, sales, actor: req.user, message }); res.json({ ok: true, salesData: payload(sales, req.user) });
  } catch (error) { console.error('Sales Compliance review failed', error); res.status(500).json({ error: 'Unable to complete Compliance review.' }); }
};
