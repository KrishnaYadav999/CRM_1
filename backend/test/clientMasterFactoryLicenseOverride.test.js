const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(root, 'frontend/src/pages/ClientMaster.jsx'), 'utf8');
const sections = fs.readFileSync(path.join(root, 'frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');

test('Brand Owner production facility answer controls Factory License applicability', () => {
  assert.match(page, /brandOwnerProductionFacility/);
  assert.match(page, /Brand Owner has a Production Facility/);
  assert.match(sections, /Does the Brand Owner have a Production Facility\?/);
  assert.match(sections, /\['Yes', 'No'\]/);
  assert.match(sections, /value === 'Yes' \? 'Applicable' : 'Not Applicable'/);
});

test('Factory License override participates in the central progress applicability list', () => {
  assert.match(page, /key !== 'factoryLicense' \|\| factoryApplicable/);
  assert.match(page, /getApplicableComplianceRows\(client\)\.flatMap/);
});
