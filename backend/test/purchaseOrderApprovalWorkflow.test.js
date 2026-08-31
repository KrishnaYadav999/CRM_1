const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('lead closure auto-fetches quotation fields and supports one or multiple POs', () => {
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');
  assert.match(page, /Quotation details auto-fetched/);
  assert.match(page, /EPR \/ Service Period/);
  assert.match(page, /Basic Amount \(INR\)/);
  assert.match(page, /Enter PO details against every quotation service/);
  assert.match(page, /quotation service row/);
  assert.match(page, /Confirm & Save Closure/);
  assert.match(page, /Lead closed and PO details saved in the database/);
  assert.match(page, /api\.put\(API_ENDPOINTS\.leads\.detail\(editingLeadId\), payload\)/);
});

test('PO received closure asks whether quotation was sent and supports earlier quotation proof', () => {
  const leadPage = read('../../frontend/src/pages/LeadGeneration.jsx');
  const leadController = read('../src/controllers/leadController.js');
  const pendingApprovalPage = read('../../frontend/src/pages/PendingApproval.jsx');
  assert.match(leadPage, /Was a quotation sent to the customer\?/);
  assert.match(leadPage, /Yes — Quotation Sent/);
  assert.match(leadPage, /No — Use Earlier Quotation Proof/);
  assert.match(leadPage, /earlierQuotationProofUrl/);
  assert.match(leadController, /closureRequestedBy/);
  assert.match(leadController, /closureRequestedBy: String\(row\?\.closureRequestedBy/);
  assert.match(leadController, /const poProofManifest = poRowsSnapshot\.map/);
  assert.match(leadController, /poFileUrl: String\(po\.poFileUrl/);
  assert.match(leadController, /poYearRows: poRowsSnapshot, poProofManifest/);
  assert.match(leadController, /status === 'APPROVED'.*closureRequestedBy/s);
  assert.match(leadController, /approval\.payload\?\.closureRequestedBy/);
  assert.doesNotMatch(leadController, /status === 'APPROVED'[\s\S]{0,300}closureRequestedBy = ''/);
  assert.match(leadController, /poApprovalStatus[\s\S]*assignedTo[\s\S]*closureRequestedBy[\s\S]*closureFinalizedByManager/);
  assert.match(pendingApprovalPage, /View earlier quotation proof/);
  assert.match(pendingApprovalPage, /row\.quotationSent === 'no' \? 0/);
});

test('approved PO unlocks manager assignment and manager assignment closes the service', () => {
  const leadPage = read('../../frontend/src/pages/LeadGeneration.jsx');
  const leadController = read('../src/controllers/leadController.js');
  const managerNotifications = read('../src/services/leadAssignmentNotifications.js');
  const staffWorkflow = read('../src/services/staffOnboardingWorkflow.js');
  assert.match(leadPage, /managerAssignmentReady/);
  assert.match(leadPage, /Select manager to close service/);
  assert.match(leadController, /changedManagerRows/);
  assert.match(managerNotifications, /assignmentIndex/);
  assert.match(staffWorkflow, /A new client is assigned to you/);
  assert.match(staffWorkflow, /await sendMail\(/);
});

test('PO approval is persisted and restricted to Admin and Super Admin', () => {
  const model = read('../src/models/PendingApproval.js');
  const routes = read('../src/routes/leads.js');
  const controller = read('../src/controllers/leadController.js');
  assert.match(model, /'purchase_order'/);
  assert.match(model, /'REVISION_REQUIRED'/);
  assert.match(routes, /purchase-order-approvals.*requireRoles\(ADMIN_ROLES\)/);
  assert.match(routes, /purchase-order-approvals\/:id\/proof/);
  assert.match(controller, /exports\.uploadPurchaseOrderProof/);
  assert.match(controller, /approval\.markModified\('payload'\)/);
  assert.match(controller, /lead\.markModified\('assignments'\)/);
  assert.match(controller, /upsertPurchaseOrderApprovals/);
  assert.match(controller, /poApprovalStatus = status/);
  assert.match(controller, /attachments: screenshotAttachment \? \[screenshotAttachment\] : \[\]/);
  assert.match(controller, /poSubmittedByEmail/);
  assert.match(controller, /role: \{ \$in: ADMIN_ROLES \}/);
  assert.match(controller, /liveRows\.length \? liveRows : snapshotRows/);
  assert.match(controller, /Purchase Order submitted for review/);
  assert.match(controller, /New PO Approval/);
  assert.match(controller, /const poProofManifest = poRowsSnapshot\.map/);
  assert.match(controller, /payload: \{[\s\S]*poYearRows: poRowsSnapshot, poProofManifest/);
  assert.match(controller, /buildPurchaseOrderEmail/);
  assert.match(controller, /Purchase Order approved successfully/);
  assert.match(controller, /leadByCompany/);
});

test('Pending Approval exposes PO approve reject and revision actions', () => {
  const page = read('../../frontend/src/pages/PendingApproval.jsx');
  assert.match(page, /label: 'PO Approval'/);
  assert.match(page, /Purchase Order Approvals/);
  assert.match(page, /REVISION_REQUIRED/);
  assert.doesNotMatch(page, /Upload correction screenshot \(required\)/);
  assert.match(page, /No image or document is required/);
  assert.match(page, /purchaseOrderApprovalDecision/);
  assert.match(page, /View PO Proof/);
  assert.match(page, /function getPoProofUrl/);
  assert.match(page, /const mergedPoRows = livePoRows\.map/);
  assert.match(page, /getPoProofUrl\(liveRow\) \|\| getPoProofUrl\(snapshot\)/);
  assert.match(page, /function getApprovalPoRows/);
  assert.match(page, /payload\.poRows/);
  assert.match(page, /payload\.purchaseOrders/);
  assert.match(page, /Upload Missing PO Proof/);
  assert.match(page, /purchaseOrderApprovalProof/);
  assert.match(page, /payload\.poProofManifest/);
  assert.match(page, /Download ·/);
  assert.match(page, /FY \/ Service Period/);
  assert.match(page, /Business Category/);
  assert.match(page, /Basic Amount/);
  assert.match(page, /hydratePurchaseOrderApprovals/);
  assert.match(page, /'PO Proof'/);
  assert.match(page, /Array\.isArray\(children\) && children\.some\(\(child\) => React\.isValidElement\(child\)\)/);
});

test('PO proof resolver preserves canonical, legacy, nested, and approval-level uploads', () => {
  const { resolvePoProof } = require('../src/services/poProofResolver');
  assert.deepEqual(resolvePoProof({ poFileUrl: 'https://example.com/current.pdf', poFileName: 'current.pdf' }), { url: 'https://example.com/current.pdf', name: 'current.pdf' });
  assert.deepEqual(resolvePoProof({ poUpload: { secure_url: 'https://example.com/legacy.pdf', originalName: 'legacy.pdf' } }), { url: 'https://example.com/legacy.pdf', name: 'legacy.pdf' });
  assert.deepEqual(resolvePoProof({}, { documentUrl: 'https://example.com/approval.pdf', documentName: 'approval.pdf' }), { url: 'https://example.com/approval.pdf', name: 'approval.pdf' });
});

test('Super Admin home omits MIS tables and Home navigation omits Activity Logs', () => {
  const dashboard = read('../../frontend/src/pages/SuperAdminDashboard.jsx');
  const navigation = read('../../frontend/src/constants/dashboard.js');
  assert.match(dashboard, /misPage && misAccess\.showSales/);
  assert.match(dashboard, /misPage && <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-200/);
  assert.doesNotMatch(navigation, /label: 'Activity Logs'/);
});
