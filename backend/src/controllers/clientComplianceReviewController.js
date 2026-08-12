const mongoose = require('mongoose');
const Client = require('../models/Client');
const PendingApproval = require('../models/PendingApproval');
const ClientComplianceReview = require('../models/ClientComplianceReview');
const { notifyClientApprovalDecision } = require('../services/clientApprovalDecisionNotifications');

const REVIEW_SECTIONS = [
  ['companyOverview', 'Company Overview'], ['basic', 'Client Basic Info'], ['addressDetails', 'Address Details'],
  ['documents', 'Documents'], ['cteCtoCca', 'CTE & CTO / CCA'], ['cpcbCredentials', 'CPCB Login Credentials'],
  ['cpcbScreenshots', 'CPCB Screenshots'], ['authorizedPersons', 'Authorized Person Details']
];

function defaultSections() { return REVIEW_SECTIONS.map(([key, label]) => ({ key, label, status: 'NOT_REVIEWED', remarks: '' })); }
function progress(sections = []) {
  const reviewed = sections.filter((item) => ['VERIFIED', 'NOT_APPLICABLE'].includes(item.status)).length;
  return { reviewed, total: REVIEW_SECTIONS.length, percentage: Math.round((reviewed / REVIEW_SECTIONS.length) * 100), issues: sections.filter((item) => item.status === 'CHANGES_REQUIRED').length };
}
async function readClient(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Client.findById(id).populate('selectedLead', 'leadCode company piboCategory eprCategory').populate('createdBy', 'name email').lean();
}
async function getOrCreateReview(clientId) {
  let review = await ClientComplianceReview.findOne({ client: clientId });
  if (!review) review = await ClientComplianceReview.create({ client: clientId, sections: defaultSections() });
  return review;
}

exports.getReview = async (req, res) => {
  const client = await readClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client Master not found' });
  const review = await getOrCreateReview(client._id);
  await review.populate([{ path: 'assignedReviewer', select: 'name email' }, { path: 'sections.reviewedBy', select: 'name email' }, { path: 'history.actionBy', select: 'name email' }]);
  return res.json({ client, review, progress: progress(review.sections) });
};

exports.updateSection = async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  const remarks = String(req.body.remarks || '').trim();
  if (!['VERIFIED', 'CHANGES_REQUIRED', 'NOT_APPLICABLE'].includes(status)) return res.status(400).json({ error: 'Select a valid verification status' });
  if (status === 'CHANGES_REQUIRED' && !remarks) return res.status(400).json({ error: 'Remarks are required when changes are requested' });
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
  const remarks = String(req.body.remarks || '').trim();
  if (!['APPROVED', 'CHANGES_REQUIRED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'Invalid review decision' });
  if (!remarks) return res.status(400).json({ error: 'Final compliance remarks are required' });
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client Master not found' });
  const review = await getOrCreateReview(client._id);
  const summary = progress(review.sections);
  if (decision === 'APPROVED' && (summary.reviewed !== summary.total || summary.issues > 0)) return res.status(409).json({ error: 'Verify every applicable tab and resolve all requested changes before approval' });
  review.status = decision; review.finalRemarks = remarks; review.assignedReviewer = review.assignedReviewer || req.user._id;
  review.history.push({ action: decision, remarks, actionBy: req.user._id });
  await review.save();
  const approvalStatus = decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'PENDING';
  client.adminControls = { ...(client.adminControls || {}), approvalStatus };
  client.data = { ...(client.data || {}), approvalMeta: { status: approvalStatus, actionBy: req.user._id, actionAt: new Date(), remarks, complianceReviewId: review._id } };
  client.markModified('data'); await client.save();
  await PendingApproval.findOneAndUpdate({ sourceClientId: String(client._id), approvalStatus: 'PENDING' }, { approvalStatus, actionBy: req.user._id, actionAt: new Date(), remarks, nextReminderAt: decision === 'CHANGES_REQUIRED' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null });
  const notification = decision === 'CHANGES_REQUIRED'
    ? { sent: false, reason: 'correction_notification_pending' }
    : await notifyClientApprovalDecision({ record: { clientName: client.data?.basic?.clientLegalName }, client, status: approvalStatus, remarks, reviewer: req.user }).catch((error) => ({ sent: false, reason: error.message }));
  return res.json({ ok: true, review, client, notification });
};

module.exports.REVIEW_SECTIONS = REVIEW_SECTIONS;
