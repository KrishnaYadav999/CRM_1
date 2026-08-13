const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');

test('a deleted database Client Master is not resurrected from browser draft cache', () => {
  assert.match(source, /function removeCachedClientDraft\(draft = \{\}\)/);
  assert.match(source, /if \(cachedDraft\?\.id\) \{/);
  assert.match(source, /removeCachedClientDraft\(cachedDraft\);\s*return null;/);
});
