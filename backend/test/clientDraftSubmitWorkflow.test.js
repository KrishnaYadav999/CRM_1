const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Client = require('../src/models/Client');
const { __test } = require('../src/controllers/clientController');

test('draft to submitted is a one-way first submission transition', () => {
  const transition = __test.getClientWorkflowTransition('draft', 'submitted');
  assert.equal(transition.error, undefined);
  assert.equal(transition.becameSubmitted, true);
  assert.equal(transition.alreadySubmitted, false);

  const downgrade = __test.getClientWorkflowTransition('submitted', 'draft');
  assert.match(downgrade.error, /cannot be changed back to draft/i);
});

test('repeat submit is idempotent and does not represent a new transition', () => {
  const transition = __test.getClientWorkflowTransition('submitted', 'submitted');
  assert.equal(transition.error, undefined);
  assert.equal(transition.becameSubmitted, false);
  assert.equal(transition.alreadySubmitted, true);
});

test('submission metadata is persisted once and preserves the original values', () => {
  const firstDate = new Date('2026-08-21T08:00:00.000Z');
  const secondDate = new Date('2026-08-21T09:00:00.000Z');
  const record = {};

  __test.applyClientSubmissionMetadata(record, 'user-1', firstDate);
  __test.applyClientSubmissionMetadata(record, 'user-2', secondDate);

  assert.equal(record.submittedAt, firstDate);
  assert.equal(record.submittedBy, 'user-1');
  assert.ok(Client.schema.path('submittedAt'));
  assert.ok(Client.schema.path('submittedBy'));
});

test('frontend record identifiers are normalized for same-document updates', () => {
  assert.equal(__test.readRequestedClientId({ recordId: 'record-1' }), 'record-1');
  assert.equal(__test.readRequestedClientId({ _id: 'record-2' }), 'record-2');
  assert.equal(__test.readRequestedClientId({ id: 'record-3' }), 'record-3');
});

test('Client Master submit uses the existing id, blocks double-clicks, clears draft cache, and refreshes the list', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(source, /recordId: editingClientId/);
  assert.match(source, /editingClientId \? await api\.put\(API_ENDPOINTS\.clients\.detail\(editingClientId\), payload\) : await api\.post/);
  assert.match(source, /if \(saveRequestRef\.current\) return/);
  assert.match(source, /Submitting\.\.\./);
  assert.match(source, /removeCachedClientDraft\(savedDraft\)/);
  assert.match(source, /Record submitted successfully\./);
  assert.match(source, /await loadPage\(\)/);
});

test('backend protects the atomic same-document draft transition', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/clientController.js'), 'utf8');
  assert.match(source, /findOneAndUpdate\(\s*\{ _id: client\._id, workflowStatus: 'draft' \}/);
  assert.match(source, /workflowStatus: 'submitted'/);
  assert.match(source, /submittedAt/);
  assert.match(source, /submittedBy/);
  assert.match(source, /alreadySubmitted/);
});
