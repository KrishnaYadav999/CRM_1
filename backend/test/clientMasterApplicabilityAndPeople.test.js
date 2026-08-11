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

test('document applicability freezes non-required Producer, Brand Owner and Importer certificates', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(page, /category\.includes\('producer'\).*\['iec', 'dicDcssi'\]/s);
  assert.match(page, /category\.includes\('brand owner'\).*\['factoryLicense', 'dicDcssi'\]/s);
  assert.match(page, /category\.includes\('importer'\).*\['factoryLicense', 'dicDcssi'\]/s);
  assert.match(page, /getApplicableComplianceRows\(client\)\.flatMap/);
});

test('Client Master approval status is limited to Compliance, Admin and Super Admin', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  assert.match(page, /\['admin', 'superadmin', 'compliance'\]\.includes\(normalizedCurrentRole\)/);
  assert.match(controller, /CLIENT_APPROVAL_ROLES\.includes/);
  assert.match(controller, /Status updated from Client Master/);
});

test('Authorized Person supports multiple cards and CPCB passwords can be viewed', () => {
  const sections = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');
  assert.match(sections, /Add Authorized Person/);
  assert.match(sections, /authorisedPersons/);
  assert.match(sections, /function PasswordField/);
  assert.match(sections, /View \$\{label\}/);
  assert.match(sections, /showCeprPassword/);
});
