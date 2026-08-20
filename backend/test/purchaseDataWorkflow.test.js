const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PURCHASE_CHECKLIST_PARTICULARS, normalizeEntityName, normalizeMaterial, normalizePurchaseRows,
  reconcilePurchaseRows, parseDate, parseNumber, defaultChecklist, purchaseReadiness, calculatePurchaseStatus
} = require('../src/services/purchaseDataService');

const FY = '2025-26';
const baseRow = (overrides = {}) => ({
  'Financial Year': FY, 'Name of Entity': 'ABC Recyclers Private Limited', 'Registration Type': 'Registered',
  GSTIN: '27ABCDE1234F1Z5', 'Invoice Number': 'INV-1', 'Invoice Date': '01-04-2025',
  'Category of Plastic': 'Cat-I', 'Plastic Material Type': 'PET', 'Quantity (TPA)': 10, 'GST Paid': 1800,
  ...overrides
});
const portalRow = (overrides = {}) => ({
  'Financial Year': FY, 'Name of Entity': 'ABC Recyclers Pvt Ltd', 'Registration Type': 'Registered',
  GSTIN: '27ABCDE1234F1Z5', 'Portal Reference Number': 'PR-1', 'Category of Plastic': 'Cat-I',
  'Plastic Material Type': 'Polyethylene Terephthalate', 'Total Plastic Qty (Tons)': 10, 'GST Paid': 1800,
  'Upload Date': '05-04-2025', ...overrides
});
const parsed = (rows, source) => normalizePurchaseRows(rows, source, FY);

test('tracker contains the nine required rows in order', () => assert.deepEqual(defaultChecklist().map((row) => row.particular), PURCHASE_CHECKLIST_PARTICULARS));
test('default tracker rows start empty and preserve saved evidence', () => {
  const rows = defaultChecklist([{ particular: 'Received from client', yesNo: 'Yes', date: '2025-04-01', files: [{ url: 'https://x.test/a.pdf' }], remarks: 'done' }]);
  assert.equal(rows[0].yesNo, 'Yes'); assert.equal(rows[0].files.length, 1); assert.equal(rows[1].yesNo, '');
});
test('comma formatted quantities parse as numbers', () => assert.equal(parseNumber('1,234.500'), 1234.5));
test('Excel serial dates are normalized', () => assert.match(parseDate(45748), /^2025-0[34]-\d{2}$/));
test('DD-MM-YYYY dates are normalized', () => assert.equal(parseDate('07-04-2025'), '2025-04-07'));
test('company suffixes normalize for entity matching', () => assert.equal(normalizeEntityName('ABC Recyclers Private Limited'), normalizeEntityName('ABC Recyclers Pvt. Ltd.')));
test('PET long name normalizes to the same material key', () => assert.equal(normalizeMaterial('Polyethylene Terephthalate'), normalizeMaterial('PET')));
test('valid base import accepts rows and totals quantity', () => { const result = parsed([baseRow()], 'base'); assert.equal(result.invalidRowCount, 0); assert.equal(result.totalQuantity, 10); });
test('valid portal import accepts the portal quantity header', () => { const result = parsed([portalRow()], 'portal'); assert.equal(result.invalidRowCount, 0); assert.equal(result.totalQuantity, 10); });
test('missing required headers reject the complete import', () => assert.throws(() => parsed([{ Name: 'ABC' }], 'base'), /Missing required headers/));
test('wrong financial year is a row validation error', () => assert.equal(parsed([baseRow({ 'Financial Year': '2024-25' })], 'base').invalidRowCount, 1));
test('malformed financial year is a row validation error', () => assert.equal(parsed([baseRow({ 'Financial Year': '25-26' })], 'base').invalidRowCount, 1));
test('invalid plastic category is rejected', () => assert.equal(parsed([baseRow({ 'Category of Plastic': 'Cat-V' })], 'base').invalidRowCount, 1));
test('negative quantity is rejected', () => assert.equal(parsed([baseRow({ 'Quantity (TPA)': -1 })], 'base').invalidRowCount, 1));
test('non-numeric GST is rejected', () => assert.equal(parsed([baseRow({ 'GST Paid': 'invalid' })], 'base').invalidRowCount, 1));
test('invalid GSTIN is rejected', () => assert.equal(parsed([baseRow({ GSTIN: 'BADGSTIN' })], 'base').invalidRowCount, 1));
test('duplicate rows are isolated from accepted rows', () => { const result = parsed([baseRow(), baseRow()], 'base'); assert.equal(result.duplicateRowCount, 1); assert.equal(result.acceptedRows.length, 1); });
test('zero quantity is accepted with a warning', () => { const result = parsed([baseRow({ 'Quantity (TPA)': 0 })], 'base'); assert.equal(result.warningRowCount, 1); assert.equal(result.invalidRowCount, 0); });
test('registered and unregistered rows remain separate', () => {
  const result = parsed([baseRow(), baseRow({ 'Name of Entity': 'Loose Supplier', GSTIN: '', 'Registration Type': 'Unregistered', 'Invoice Number': 'INV-2' })], 'base');
  const summary = reconcilePurchaseRows(result.acceptedRows, []); assert.equal(summary.entitySummary.Registered.length, 1); assert.equal(summary.entitySummary.Unregistered.length, 1);
});
test('matched uploads reconcile by GSTIN, category and normalized material', () => {
  const summary = reconcilePurchaseRows(parsed([baseRow()], 'base').acceptedRows, parsed([portalRow()], 'portal').acceptedRows);
  assert.equal(summary.totals.result, 'Matched'); assert.equal(summary.blockingIssueCount, 0); assert.equal(summary.matchingEntities, 1);
});
test('missing portal entity is a blocking issue', () => { const summary = reconcilePurchaseRows(parsed([baseRow()], 'base').acceptedRows, []); assert.equal(summary.totals.result, 'Missing on Portal'); assert.ok(summary.blockingIssueCount > 0); });
test('extra portal entity is a blocking issue', () => { const summary = reconcilePurchaseRows([], parsed([portalRow()], 'portal').acceptedRows); assert.equal(summary.totals.result, 'Extra on Portal'); assert.ok(summary.blockingIssueCount > 0); });
test('quantity inside tolerance is matched', () => { const summary = reconcilePurchaseRows(parsed([baseRow()], 'base').acceptedRows, parsed([portalRow({ 'Total Plastic Qty (Tons)': 10.0005 })], 'portal').acceptedRows); assert.equal(summary.totals.result, 'Matched'); });
test('short upload becomes a warning issue', () => { const summary = reconcilePurchaseRows(parsed([baseRow()], 'base').acceptedRows, parsed([portalRow({ 'Total Plastic Qty (Tons)': 9 })], 'portal').acceptedRows); assert.equal(summary.totals.result, 'Short Upload'); assert.equal(summary.warningIssueCount, 1); });
test('GST difference is detected even when quantity matches', () => { const summary = reconcilePurchaseRows(parsed([baseRow()], 'base').acceptedRows, parsed([portalRow({ 'GST Paid': 1700 })], 'portal').acceptedRows); assert.equal(summary.totals.result, 'GST Mismatch'); });
test('normal path is not ready until tracker, proof and both imports exist', () => { const value = { checklist: defaultChecklist() }; assert.equal(purchaseReadiness(value).ready, false); assert.match(purchaseReadiness(value).errors.join(' '), /Upload Complete/); });
test('Nil Upload path requires date, row proof, reason and screenshot evidence', () => { const checklist = defaultChecklist().map((row) => row.particular === 'Nil Upload' ? { ...row, yesNo: 'Yes' } : row); const readiness = purchaseReadiness({ checklist }); assert.equal(readiness.ready, false); assert.equal(readiness.nilUpload, true); assert.equal(readiness.errors.length, 4); });
test('complete Nil Upload evidence bypasses both Excel files', () => { const checklist = defaultChecklist().map((row) => row.particular === 'Nil Upload' ? { ...row, yesNo: 'Yes', date: '2025-04-10', files: [{ url: 'https://x.test/proof.pdf' }], remarks: 'No purchases' } : row); assert.equal(purchaseReadiness({ checklist, screenshots: [{ url: 'https://x.test/screenshot.png' }] }).ready, true); });
test('fully approved status wins over upload status', () => assert.equal(calculatePurchaseStatus({ complianceVerificationStatus: 'Approved' }), 'Fully Approved'));
test('routes expose import, reconciliation and two-level approvals behind authentication', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/clients.js'), 'utf8');
  assert.match(routes, /purchase-imports\/:source', requireAuth/); assert.match(routes, /purchase-reconciliation', requireAuth/);
  assert.match(routes, /purchase-data\/manager-review', requireAuth/); assert.match(routes, /purchase-data\/compliance-review', requireAuth/);
});
test('frontend mounts Purchase Data inside Data Compliance and exposes all requested tabs', () => {
  const annual = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterAnnualReturn.jsx'), 'utf8');
  const workspace = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/PurchaseDataWorkspace.jsx'), 'utf8');
  assert.match(annual, /<PurchaseDataWorkspace/);
  ['Purchase Data','Sales Data','Pre Consumer / State / Annual','EPR Target','EPR CREDIT','Upload All Screenshot'].forEach((tab) => assert.match(workspace, new RegExp(tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});
test('Yes status displays required date and drag-drop proof validation', () => {
  const workspace = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/PurchaseDataWorkspace.jsx'), 'utf8');
  const dropzone = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/PurchaseProofDropzone.jsx'), 'utf8');
  assert.match(workspace, /row\.yesNo === 'Yes'/);
  assert.match(workspace, /Proof upload is required for a Yes status/);
  assert.match(workspace, /Date is required\./);
  assert.match(dropzone, /onDrop=/);
  assert.match(dropzone, /window\.addEventListener\('drop', preventFileNavigation\)/);
  assert.match(dropzone, /event\.stopPropagation\(\)/);
  assert.match(dropzone, /Drop files to upload/);
  assert.match(dropzone, /Drag & drop images, PDF, EML or Outlook MSG/);
});
test('Outlook MSG proof opens a safe decoded mail viewer with attachments', () => {
  const viewer = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/OutlookMsgViewer.jsx'), 'utf8');
  assert.match(viewer, /import\('@kenjiuno\/msgreader'\)/);
  assert.match(viewer, /getFileData\(\)/);
  assert.match(viewer, /getAttachment\(item\)/);
  assert.match(viewer, /Clean text view/);
  assert.doesNotMatch(viewer, /dangerouslySetInnerHTML/);
});
