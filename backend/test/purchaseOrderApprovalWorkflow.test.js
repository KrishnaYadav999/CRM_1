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
});

test('Pending Approval exposes PO approve reject and revision actions', () => {
  const page = read('../../frontend/src/pages/PendingApproval.jsx');
  assert.match(page, /label="PO Approval"/);
  assert.match(page, /Purchase Order Approvals/);
  assert.match(page, /REVISION_REQUIRED/);
  assert.match(page, /Upload correction screenshot \(required\)/);
  assert.match(page, /purchaseOrderApprovalDecision/);
});
