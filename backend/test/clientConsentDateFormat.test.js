const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('CRM date picker displays and accepts DD/MM/YYYY while retaining ISO storage', () => {
  const sections = fs.readFileSync(path.join(root, 'frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'frontend/src/components/form/PremiumDatePicker.jsx'), 'utf8');

  for (const key of ['cteIssuedDate', 'cteValidDate', 'ctoIssueDate', 'ctoValidDate']) {
    assert.match(sections, new RegExp(`key: '${key}'[^\\n]+type: 'date'`));
  }
  assert.match(picker, /parseManualDate/);
  assert.match(picker, /const \[, day, month, year\] = match/);
  assert.match(picker, /manualDateValue/);
  assert.match(picker, /return `\$\{String\(date\.getDate\(\)\).*\/\$\{String\(date\.getMonth\(\) \+ 1\).*\/\$\{date\.getFullYear\(\)\}`/);
  assert.match(picker, /placeholder="DD\/MM\/YYYY"/);
  assert.match(picker, /type DD\/MM\/YYYY/);
  assert.doesNotMatch(picker, /YYYY\/MM\/DD/);
  assert.doesNotMatch(sections, /YYYY\/MM\/DD|yyyy\/mm\/dd/);
});
