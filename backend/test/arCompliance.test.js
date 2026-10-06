const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSections, reviewState, validateDecision } = require('../src/services/arCompliance');
const Client = require('../src/models/Client');
const AnnualReturn = require('../src/models/AnnualReturn');
const PurchaseData = require('../src/models/PurchaseData');
const SalesData = require('../src/models/SalesData');
const PurchaseRows = require('../src/models/PurchaseImportRow');
const SalesRows = require('../src/models/SalesImportRow');
const Review = require('../src/models/ArComplianceReview');
const controller = require('../src/controllers/arComplianceController');
const id = '64b000000000000000000002';
const user = { _id: '64b000000000000000000001', role: 'compliance' };
const query = (value) => ({ populate() { return this; }, select() { return this; }, sort() { return this; }, async lean() { return value; } });
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }
function fixture(t, savedReview = null) {
  const client = { _id: id, data: { basic: { clientLegalName: 'Test Client' }, annualReturn: { filings: { '2025-26': { draft: { 'basic.gstNumber': 'GST123', 'data.productionFacility': false } } } } } };
  t.mock.method(Client, 'findOne', () => query(structuredClone(client)));
  t.mock.method(AnnualReturn, 'find', () => query([]));
  for (const model of [PurchaseData, SalesData]) { t.mock.method(model, 'distinct', async () => []); t.mock.method(model, 'findOne', () => query(null)); }
  for (const model of [PurchaseRows, SalesRows]) t.mock.method(model, 'find', () => query([]));
  t.mock.method(Review, 'findOne', () => query(savedReview));
  return client;
}
test('AR source includes grouped draft, every checklist field, proof, reconciliation and imported values without mutating source', () => {
  const source = { draft: { 'basic.gstNumber': 'GST', 'basic.plantLocation': '', 'data.productionFacility': false, savedAt: 'ignore', __completedTabs: { basic: true } }, purchase: { checklist: [{ particular: 'Received from client', status: 'Yes', partiallyDataReceived: true, proofs: [{ name: 'proof.pdf', url: 'https://example.test/proof.pdf' }] }], reconciliation: { quantity: 0 } }, purchaseRows: [{ entityName: 'Factory', quantity: 12 }] };
  const before = structuredClone(source);
  const sections = buildSections(source);
  assert.deepEqual(source, before);
  assert.equal(sections.filter((section) => section.label === 'Basic Info').length, 1);
  const fields = sections.flatMap((section) => section.fields);
  assert.ok(fields.some((field) => field.value === false));
  assert.ok(fields.some((field) => field.value === 0));
  assert.ok(fields.some((field) => field.value === ''));
  assert.ok(fields.some((field) => field.url === 'https://example.test/proof.pdf'));
  assert.ok(fields.some((field) => field.value === 'Factory'));
  assert.ok(!fields.some((field) => /Saved At|Completed Tabs/.test(field.label)));
  assert.equal(new Set(fields.map((field) => field.key)).size, fields.length);
});
test('changed user value invalidates only that field and final AR status; identical data keeps review', () => {
  const sections = buildSections({ draft: { 'basic.name': 'A', 'basic.total': 0 } });
  const initial = reviewState(sections);
  const fields = sections.flatMap((section) => section.fields).map((field) => ({ key: field.key, fingerprint: field.fingerprint, status: 'VERIFIED', remarks: 'Checked' }));
  const saved = { fields, status: 'APPROVED', sourceFingerprint: initial.sourceFingerprint };
  assert.equal(reviewState(sections, saved).progress.verified, 2);
  const changed = reviewState(buildSections({ draft: { 'basic.name': 'B', 'basic.total': 0 } }), saved);
  assert.equal(changed.status, 'IN_REVIEW'); assert.equal(changed.progress.verified, 1);
  assert.equal(changed.sections[0].fields[0].review.stale, true);
});
test('final decisions require every field review, full approval all verified, partial approval mixed results', () => {
  const state = { progress: { total: 2, reviewed: 1, verified: 1 } };
  assert.match(validateDecision('REJECTED', 'Reason', state), /every field/);
  state.progress.reviewed = 2;
  assert.match(validateDecision('APPROVED', 'Reason', state), /Verify every/);
  assert.equal(validateDecision('PARTIALLY_APPROVED', 'Reason', state), '');
  assert.equal(validateDecision('REJECTED', 'Reason', state), '');
  state.progress.verified = 2;
  assert.equal(validateDecision('APPROVED', 'Reason', state), '');
  assert.match(validateDecision('PARTIALLY_APPROVED', 'Reason', state), /both verified/);
  assert.match(validateDecision('APPROVED', '', state), /remarks/);
  assert.match(validateDecision('EDIT_DATA', 'Reason', state), /Select/);
});
test('AR read endpoint selects saved financial year and exposes user values as review fields', async (t) => {
  fixture(t);
  const res = response();
  await controller.get({ params: { id }, query: { financialYear: '2025-26' }, user }, res, (error) => { throw error; });
  assert.equal(res.body.financialYear, '2025-26'); assert.equal(res.body.client.name, 'Test Client');
  assert.equal(res.body.progress.total, 2); assert.equal(res.body.status, 'PENDING');
});
test('AR endpoints reject missing clients and nonexistent field keys without writes', async (t) => {
  fixture(t);
  let writes = 0; t.mock.method(Review, 'updateOne', async () => { writes++; });
  const res = response(); await controller.saveField({ params: { id }, query: {}, user, body: { financialYear: '2025-26', key: 'forged', status: 'VERIFIED', remarks: 'x' } }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 409); assert.equal(writes, 0);
  const missing = response(); await controller.get({ params: { id: 'bad' }, query: {}, user }, missing, (error) => { throw error; }); assert.equal(missing.statusCode, 404);
});
test('field review writes only review collection and preserves source value despite injected data', async (t) => {
  const client = fixture(t);
  const field = buildSections({ draft: client.data.annualReturn.filings['2025-26'].draft })[0].fields[0];
  const writes = []; t.mock.method(Review, 'updateOne', async (filter, update) => { writes.push(update); return { matchedCount: 1 }; });
  t.mock.method(Client, 'updateOne', () => { throw new Error('AR review must not edit client data'); });
  t.mock.method(AnnualReturn, 'updateOne', () => { throw new Error('AR review must not edit annual data'); });
  const res = response(); await controller.saveField({ params: { id }, query: {}, user, body: { financialYear: '2025-26', key: field.key, fingerprint: field.fingerprint, status: 'VERIFIED', remarks: 'Verified GST', data: { 'basic.gstNumber': 'tampered' } } }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 200); assert.equal(writes.length, 2);
  assert.equal(client.data.annualReturn.filings['2025-26'].draft['basic.gstNumber'], 'GST123');
  assert.ok(Array.isArray(writes[1]));
  assert.equal(writes[1][0].$set.fields.$concatArrays[1].$literal[0].reviewedBy, user._id);
});
test('final API rejects old source fingerprint and unreviewed fields without saving', async (t) => {
  const client = fixture(t);
  const state = reviewState(buildSections({ draft: client.data.annualReturn.filings['2025-26'].draft }));
  let writes = 0; t.mock.method(Review, 'updateOne', async () => { writes++; });
  for (const [sourceFingerprint, code] of [['old', 409], [state.sourceFingerprint, 400]]) {
    const res = response(); await controller.decide({ params: { id }, query: {}, user, body: { financialYear: '2025-26', sourceFingerprint, decision: 'APPROVED', remarks: 'Reviewed' } }, res, (error) => { throw error; }); assert.equal(res.statusCode, code);
  }
  assert.equal(writes, 0);
});
test('all AR endpoints require authentication and compliance approval roles', () => {
  const router = require('../src/routes/clients');
  const routes = router.stack.filter((layer) => layer.route?.path.includes('ar-compliance'));
  assert.equal(routes.length, 4);
  for (const layer of routes) {
    assert.equal(layer.route.stack[0].handle.name, 'requireAuth');
    assert.equal(layer.route.stack.length, 3);
    const denied = response(); let passed = false;
    layer.route.stack[1].handle({ user: { role: 'operation' } }, denied, () => { passed = true; });
    assert.equal(denied.statusCode, 403); assert.equal(passed, false);
    for (const role of ['admin', 'compliance', 'compliance manager']) {
      let allowed = false; layer.route.stack[1].handle({ user: { role } }, response(), () => { allowed = true; });
      assert.equal(allowed, true, `${role} must access AR compliance`);
    }
  }
});
test('final API persists reviewer, financial year and decision with concurrent review protection', async (t) => {
  const draft = { 'basic.gstNumber': 'GST123', 'data.productionFacility': false };
  const sections = buildSections({ draft });
  const state = reviewState(sections);
  const review = { status: 'IN_REVIEW', sourceFingerprint: state.sourceFingerprint, updatedAt: new Date(), fields: sections.flatMap((section) => section.fields).map((field) => ({ key: field.key, fingerprint: field.fingerprint, status: 'VERIFIED', remarks: 'Checked' })) };
  fixture(t, review);
  let write;
  t.mock.method(Review, 'updateOne', async (filter, update) => { write = { filter, update }; return { matchedCount: 1 }; });
  const req = { params: { id }, query: {}, user, body: { financialYear: '2025-26', sourceFingerprint: state.sourceFingerprint, decision: 'APPROVED', remarks: 'All verified' } };
  const res = response(); await controller.decide(req, res, (error) => { throw error; });
  assert.equal(res.statusCode, 200); assert.equal(write.filter.financialYear, '2025-26');
  assert.deepEqual(write.filter.updatedAt, review.updatedAt); assert.equal(write.update.$set.status, 'APPROVED');
  assert.equal(write.update.$set.decidedBy, user._id); assert.equal(write.update.$set.finalRemarks, 'All verified');
  t.mock.method(Review, 'updateOne', async () => ({ matchedCount: 0 }));
  const conflict = response(); await controller.decide(req, conflict, (error) => { throw error; }); assert.equal(conflict.statusCode, 409);
});
test('AR queue includes saved purchase and annual years and returns changed approved data for review', async (t) => {
  const client = { _id: id, data: { basic: { clientLegalName: 'Queue Client' }, annualReturn: { filings: { '2025-26': { savedAt: '2026-10-06T10:00:00Z', draft: { amount: 123 } } } } } };
  t.mock.method(Client, 'find', () => query([client]));
  t.mock.method(AnnualReturn, 'find', () => query([]));
  t.mock.method(PurchaseData, 'find', () => query([{ clientId: id, financialYear: '2024-25' }]));
  t.mock.method(SalesData, 'find', () => query([]));
  t.mock.method(Review, 'find', () => query([{ client: id, financialYear: '2025-26', status: 'APPROVED', decidedAt: '2026-10-05T10:00:00Z', decidedBy: { name: 'Reviewer' } }]));
  const res = response(); await controller.list({ user }, res, (error) => { throw error; });
  assert.equal(res.body.rows.length, 2);
  assert.equal(res.body.rows.find((row) => row.financialYear === '2025-26').status, 'IN_REVIEW');
  assert.equal(res.body.rows.find((row) => row.financialYear === '2024-25').status, 'PENDING');
  assert.equal(res.body.rows[0].decisionBy, 'Reviewer');
});
