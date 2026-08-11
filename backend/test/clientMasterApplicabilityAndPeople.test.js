const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('MSME applicability controls validation and Document completion', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  const sections = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');
  assert.match(sections, /Is MSME applicable for this client/);
  assert.match(page, /client\.compliance\?\.msmeApplicable === 'Yes'/);
  assert.match(page, /MSME details are not required|MSME is Applicable/);
  assert.match(page, /countFields\(client, \[\['compliance', 'msmeApplicable'\]\]\)/);
});

test('Authorized Person supports multiple cards and CPCB passwords can be viewed', () => {
  const sections = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');
  assert.match(sections, /Add Authorized Person/);
  assert.match(sections, /authorisedPersons/);
  assert.match(sections, /function PasswordField/);
  assert.match(sections, /View \$\{label\}/);
  assert.match(sections, /showCeprPassword/);
});
