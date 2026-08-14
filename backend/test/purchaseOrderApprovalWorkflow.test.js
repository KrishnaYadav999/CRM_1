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
  assert.match(page, /Confirm Lead Closure/);
});

test('PO approval is persisted and restricted to Admin and Super Admin', () => {
  const model = read('../src/models/PendingApproval.js');
  const routes = read('../src/routes/leads.js');
  const controller = read('../src/controllers/leadController.js');
  assert.match(model, /'purchase_order'/);
  assert.match(model, /'REVISION_REQUIRED'/);
  assert.match(routes, /purchase-order-approvals.*requireRoles\(ADMIN_ROLES\)/);
  assert.match(controller, /upsertPurchaseOrderApprovals/);
  assert.match(controller, /poApprovalStatus = status/);
  assert.match(controller, /attachments: screenshotAttachment \? \[screenshotAttachment\] : \[\]/);
  assert.match(controller, /poSubmittedByEmail/);
  assert.match(controller, /role: \{ \$in: ADMIN_ROLES \}/);
  assert.match(controller, /liveRows\.length \? liveRows : snapshotRows/);
  assert.match(controller, /Purchase Order submitted for review/);
  assert.match(controller, /New PO Approval/);
  assert.match(controller, /buildPurchaseOrderEmail/);
  assert.match(controller, /Purchase Order approved successfully/);
  assert.match(controller, /leadByCompany/);
});

test('Pending Approval exposes PO approve reject and revision actions', () => {
  const page = read('../../frontend/src/pages/PendingApproval.jsx');
  assert.match(page, /label="PO Approval"/);
  assert.match(page, /Purchase Order Approvals/);
  assert.match(page, /REVISION_REQUIRED/);
  assert.doesNotMatch(page, /Upload correction screenshot \(required\)/);
  assert.match(page, /No image or document is required/);
  assert.match(page, /purchaseOrderApprovalDecision/);
  assert.match(page, /View PO Proof/);
  assert.match(page, /Download ·/);
  assert.match(page, /FY \/ Service Period/);
  assert.match(page, /Business Category/);
  assert.match(page, /Basic Amount/);
  assert.match(page, /hydratePurchaseOrderApprovals/);
  assert.match(page, /'PO Proof'/);
});

test('Super Admin home omits MIS tables and Home navigation omits Activity Logs', () => {
  const dashboard = read('../../frontend/src/pages/SuperAdminDashboard.jsx');
  const navigation = read('../../frontend/src/constants/dashboard.js');
  assert.match(dashboard, /misPage && misAccess\.showSales/);
  assert.match(dashboard, /misPage && <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-200/);
  assert.doesNotMatch(navigation, /label: 'Activity Logs'/);
});
