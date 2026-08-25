const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('closed lead edits preserve saved PO evidence only for an existing assigned service', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  assert.match(source, /function preserveExistingClosureEvidence/);
  assert.match(source, /assignedServiceId/);
  assert.match(source, /previousPoRows/);
  assert.match(source, /const data = preserveExistingClosureEvidence\(beforeLead, cleanBody\(req\.body\)\)/);
  assert.match(source, /if \(!previous\) return row/);
});
