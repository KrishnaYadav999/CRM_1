const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('client service chooser removes legacy duplicate applicant cards', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');

  assert.match(source, /function normalizeChooserServiceCategory/);
  assert.match(source, /token\.includes\('plastic'\).*return 'plastic-waste'/);
  assert.match(source, /function dedupeClientServiceChooserOptions/);
  assert.match(source, /optionsByApplicantAndCategory/);
  assert.match(source, /canonicalCategory \? 100 : 0/);
  assert.match(source, /return dedupeClientServiceChooserOptions\(persistedRecords\)/);
});
