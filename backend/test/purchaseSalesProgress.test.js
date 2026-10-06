const test = require('node:test');
const assert = require('node:assert/strict');
const summarize = require('../src/services/purchaseSalesProgress');
const { REQUIRED_NORMAL_CHECKLIST_ROWS } = require('../src/services/purchaseDataService');

test('two uploads alone do not count a client as fully filled', () => {
  const result = summarize([{ clientId: 'one', baseUpload: { importStatus: 'Imported' }, portalUpload: { importStatus: 'Imported' } }]);
  assert.equal(result.one.status, 'Completed');
  assert.equal(result.one.complete, false);
});
test('full mandatory checklist and imports count once per client; blocking issues prevent completion', () => {
  const record = { clientId: 'one', checklist: REQUIRED_NORMAL_CHECKLIST_ROWS.map((particular) => ({ particular, yesNo: 'Yes', date: '2026-04-01', files: [{ url: 'https://example.com/proof.pdf' }] })), baseUpload: { importStatus: 'Imported' }, portalUpload: { importStatus: 'Imported' } };
  assert.equal(summarize([record]).one.complete, true);
  assert.equal(summarize([{ ...record, reconciliation: { blockingIssueCount: 1 } }]).one.complete, false);
  assert.deepEqual(summarize([]), {});
});
test('Purchase completion never fills the independent Sales summary', () => {
  const record = { clientId: 'one', checklist: [{ particular: 'Nil Upload', yesNo: 'Yes' }, { particular: 'Client Approval on data', yesNo: 'Yes', date: '2026-04-01', files: [{ url: 'https://example.com/proof.pdf' }] }] };
  assert.equal(summarize([record]).one.complete, true);
  assert.equal(summarize([]).one, undefined);
});
