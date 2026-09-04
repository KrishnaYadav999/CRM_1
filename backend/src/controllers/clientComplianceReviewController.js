const mongoose = require('mongoose');
const Client = require('../models/Client');
const PendingApproval = require('../models/PendingApproval');
const ClientComplianceReview = require('../models/ClientComplianceReview');
const { notifyClientApprovalDecision } = require('../services/clientApprovalDecisionNotifications');
const { getAssignedServiceId, resolveClientMasterData } = require('../services/clientMasterResolver');
const { analyzeClientMasterData } = require('../services/userProductivityReport');

const REVIEW_SECTIONS = [
  ['companyOverview', 'Company Overview'], ['basic', 'Client Basic Info'], ['addressDetails', 'Address Details'],
  ['documents', 'Documents'], ['cteCtoCca', 'CTE & CTO / CCA'], ['cpcbCredentials', 'CPCB Login Credentials'],
  ['cpcbScreenshots', 'CPCB Screenshots'], ['processFlowDiagrams', 'Process Flow & Machinery Diagrams'],
  ['authorizedPersons', 'Authorized Person Details']
];

function defaultSections() { return REVIEW_SECTIONS.map(([key, label]) => ({ key, label, status: 'NOT_REVIEWED', remarks: '' })); }
function progress(sections = []) {
  const reviewed = sections.filter((item) => item.status === 'VERIFIED').length;
  return { reviewed, total: REVIEW_SECTIONS.length, percentage: Math.round((reviewed / REVIEW_SECTIONS.length) * 100), issues: sections.filter((item) => item.status === 'CHANGES_REQUIRED').length };
}
function percentage(filled, total) { return total ? Math.round((filled / total) * 100) : 0; }
function rowCompletion(rows = [], keys = []) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.length * keys.length;
  const filled = list.reduce((sum, row) => sum + keys.filter((key) => {
    const value = row?.[key];
    return Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Boolean(value.url || value.secureUrl || value.dataUrl || value.path || value.name || value.fileName) : String(value ?? '').trim();
  }).length, 0);
  return percentage(filled, total);
}
function completionByReviewSection(data = {}) {
  const analysis = analyzeClientMasterData(data);
  const byName = new Map(analysis.sections.map((section) => [section.name, section]));
  const combine = (...names) => {
    const rows = names.map((name) => byName.get(name)).filter(Boolean);
    return percentage(rows.reduce((sum, row) => sum + row.filled, 0), rows.reduce((sum, row) => sum + row.total, 0));
  };
  return {
    companyOverview: combine('Company Overview'),
    basic: combine('Client Basic Info'),
    addressDetails: combine('Registered Address', 'Communication Address'),
    documents: combine('Documents', 'MSME Details'),
    cteCtoCca: combine('CTE & CTO / CCA'),
    cpcbCredentials: combine('CPCB Credentials'),
    cpcbScreenshots: rowCompletion(data.cpcbScreenshots, ['name', 'file']),
    processFlowDiagrams: rowCompletion(data.processDiagrams, ['name', 'file']),
    authorizedPersons: combine('Authorized Person Details')
  };
}
async function readClient(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Client.findById(id).populate('selectedLead', 'leadCode company piboCategory eprCategory').populate('createdBy', 'name email').lean();
}
async function getOrCreateReview(clientId) {
  let review = await ClientComplianceReview.findOne({ client: clientId });
  if (!review) review = await ClientComplianceReview.create({ client: clientId, sections: defaultSections() });
  const existingKeys = new Set(review.sections.map((section) => section.key));
  const missingSections = defaultSections().filter((section) => !existingKeys.has(section.key));
  if (missingSections.length) { review.sections.push(...missingSections); await review.save(); }
  return review;
}

exports.getReview = async (req, res) => {
  const client = await readClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client Master not found' });
  client.data = resolveClientMasterData(client, getAssignedServiceId(client));
  const review = await getOrCreateReview(client._id);
  await review.populate([{ path: 'assignedReviewer', select: 'name email' }, { path: 'sections.reviewedBy', select: 'name email' }, { path: 'history.actionBy', select: 'name email' }]);
  return res.json({ client, review, progress: progress(review.sections), completionBySection: completionByReviewSection(client.data) });
};

exports.updateSection = async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  const remarks = String(req.body.remarks || '').trim();
  if (!['VERIFIED', 'CHANGES_REQUIRED'].includes(status)) return res.status(400).json({ error: 'Select Verified or Changes Required' });
  if (!remarks) return res.status(400).json({ error: 'Tab remarks are required before saving this review' });
  const review = await getOrCreateReview(req.params.id);
  const section = review.sections.find((item) => item.key === req.params.sectionKey);
  if (!section) return res.status(404).json({ error: 'Verification section not found' });
  section.status = status; section.remarks = remarks; section.reviewedBy = req.user._id; section.reviewedAt = new Date();
  review.assignedReviewer = review.assignedReviewer || req.user._id;
  review.status = status === 'CHANGES_REQUIRED' ? 'CHANGES_REQUIRED' : 'IN_REVIEW';
  review.history.push({ action: `SECTION_${status}`, sectionKey: section.key, remarks, actionBy: req.user._id });
  await review.save();
  return res.json({ review, progress: progress(review.sections) });
};

exports.completeReview = async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  const approvalMode = String(req.body.approvalMode || '').toUpperCase();
  const remarks = String(req.body.remarks || '').trim();
  if (!['APPROVED', 'CHANGES_REQUIRED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'Invalid review decision' });
  if (!remarks) return res.status(400).json({ error: 'Final compliance remarks are required' });
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client Master not found' });
  const review = await getOrCreateReview(client._id);
  const summary = progress(review.sections);
  const everyTabHasRemarks = review.sections.every((section) => String(section.remarks || '').trim());
  if (decision === 'APPROVED' && !everyTabHasRemarks) return res.status(409).json({ error: 'Add and save remarks for every tab before approving the client' });
  if (decision === 'APPROVED' && (summary.reviewed !== summary.total || summary.issues > 0)) return res.status(409).json({ error: 'Verify every applicable tab and resolve all requested changes before approval' });
  review.status = decision; review.finalRemarks = remarks; review.assignedReviewer = review.assignedReviewer || req.user._id;
  review.history.push({ action: decision, remarks, actionBy: req.user._id });
  await review.save();
  const approvalStatus = decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'PENDING';
  client.adminControls = { ...(client.adminControls || {}), approvalStatus };
  client.data = { ...(client.data || {}), approvalMeta: { status: approvalStatus, actionBy: req.user._id, actionAt: new Date(), remarks, complianceReviewId: review._id } };
  client.markModified('data'); await client.save();
  const decidedAt = new Date();
  const existingPendingRecord = await PendingApproval.findOne({ sourceClientId: String(client._id), type: 'client' }).lean();
  const correctionRequired = decision === 'CHANGES_REQUIRED' || decision === 'REJECTED';
  const correctionFields = correctionRequired ? {
    correctionStatus: 'OPEN',
    correctionDecision: decision === 'REJECTED' ? 'REJECTED' : 'PARTIALLY_APPROVED',
    correctionStartedAt: decidedAt,
    correctionReminderAt: new Date(decidedAt.getTime() + 24 * 60 * 60 * 1000),
    correctionReminderSentAt: null,
    correctionDueAt: new Date(decidedAt.getTime() + 48 * 60 * 60 * 1000),
    correctionBreachedAt: null,
    correctionResolvedAt: null,
    correctionEmailError: '',
    reminderFlag: 'GREEN',
    redFlagAt: null,
    greenFlagDeadline: new Date(decidedAt.getTime() + 48 * 60 * 60 * 1000)
  } : {
    correctionStatus: 'RESOLVED',
    correctionResolvedAt: decidedAt,
    correctionReminderAt: null,
    correctionDueAt: null,
    correctionEmailError: '',
    reminderFlag: existingPendingRecord?.reminderFlag === 'PERMANENT_RED' ? 'PERMANENT_RED' : 'GREEN',
    greenFlagAt: decidedAt,
    redFlagAt: existingPendingRecord?.reminderFlag === 'PERMANENT_RED' ? existingPendingRecord.redFlagAt : null,
    greenFlagDeadline: null
  };
  const pendingRecord = await PendingApproval.findOneAndUpdate(
    { sourceClientId: String(client._id), type: 'client' },
    { $set: { approvalStatus, actionBy: req.user._id, actionAt: decidedAt, remarks, nextReminderAt: null, ...correctionFields } },
    { new: true }
  );
  const notificationMode = approvalMode || (decision === 'CHANGES_REQUIRED' ? 'CORRECTION' : decision);
  const notification = await notifyClientApprovalDecision({ record: { clientName: client.data?.basic?.clientLegalName }, client, status: approvalStatus, remarks, reviewer: req.user, sections: review.sections, approvalMode: notificationMode }).catch((error) => ({ sent: false, reason: error.message }));
  if (pendingRecord && correctionRequired && notification?.email) {
    pendingRecord.correctionRecipientId = notification.recipientId || undefined;
    pendingRecord.correctionRecipientEmail = notification.email;
    pendingRecord.correctionRecipientName = notification.recipientName || '';
    await pendingRecord.save();
  }
  return res.json({ ok: true, review, client, notification });
};

module.exports.REVIEW_SECTIONS = REVIEW_SECTIONS;
