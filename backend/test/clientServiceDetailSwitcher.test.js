const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');

test('Client Master detail can switch between records for multiple assigned services', () => {
  assert.match(page, /function getRelatedClientServices\(/);
  assert.match(page, /serviceClients=\{getRelatedClientServices\(clients, viewClient\)\}/);
  assert.match(page, /View Assigned Service/);
  assert.match(page, /onServiceChange\?\.\(selected\)/);
  assert.match(page, /getClientServiceOptionLabel\(item, index\)/);
});

test('legacy multi-service Client Master records remain separate and receive dropdown options from the lead', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  assert.match(page, /legacy-service:/);
  assert.match(page, /populatedLead\?\.serviceSelections/);
  assert.match(page, /activateAssignedService\(sourceData, service, services\.length\)/);
  assert.match(page, /function getClientServiceViewKey/);
  assert.match(page, /getClientServiceViewKey\(item\) === event\.target\.value/);
  assert.match(controller, /designation serviceSelections addresses contacts assignments/);
});

test('Client Master service chooser removes business-identical duplicate services', () => {
  assert.match(page, /function clientMasterServiceFingerprint\(service = \{\}\)/);
  assert.match(page, /function uniqueClientMasterServices\(services = \[\]\)/);
  assert.match(page, /return uniqueClientMasterServices\(rows\)\.map/);
  assert.match(page, /service\.plantUnit/);
  assert.match(page, /service\.firstAnnualReturnYearApplicable/);
});
