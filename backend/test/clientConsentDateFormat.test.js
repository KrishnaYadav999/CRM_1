const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('CTE and CTO consent fields use full dates displayed as YYYY/MM/DD', () => {
  const sections = fs.readFileSync(path.join(root, 'frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'frontend/src/components/form/PremiumDatePicker.jsx'), 'utf8');

  for (const key of ['cteIssuedDate', 'cteValidDate', 'ctoIssueDate', 'ctoValidDate']) {
    assert.match(sections, new RegExp(`key: '${key}'[^\\n]+type: 'date'`));
  }
  assert.match(sections, /displayFormat="yyyy\/mm\/dd"/);
  assert.match(picker, /displayFormat === 'yyyy\/mm\/dd'/);
  assert.match(picker, /dateKey\(selected\)\.replaceAll\('-', '\/'\)/);
});
