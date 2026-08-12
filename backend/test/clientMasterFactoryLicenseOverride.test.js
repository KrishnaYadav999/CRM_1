const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(root, 'frontend/src/pages/ClientMaster.jsx'), 'utf8');
const sections = fs.readFileSync(path.join(root, 'frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');

test('Brand Owner can override Factory License applicability with a mandatory reason', () => {
  assert.match(page, /factoryLicenseApplicability === 'Applicable'/);
  assert.match(page, /factoryLicenseApplicabilityReason/);
  assert.match(page, /Factory License is marked Applicable/);
  assert.match(sections, /Is Factory License applicable to this Brand Owner\?/);
  assert.match(sections, /Default is Not Applicable/);
  assert.match(sections, /Applicability Reason/);
});

test('Factory License override participates in the central progress applicability list', () => {
  assert.match(page, /key !== 'factoryLicense' \|\| factoryApplicable/);
  assert.match(page, /getApplicableComplianceRows\(client\)\.flatMap/);
});
