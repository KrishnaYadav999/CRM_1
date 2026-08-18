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
  assert.match(page, /api\.get\(API_ENDPOINTS\.clients\.detail\(clientMasterId\)/);
  assert.match(page, /requestId !== clientRecordRequestRef\.current/);
  assert.match(page, /onServiceChange=\{openClientView\}/);
});

test('service resolver never falls through to generic CPCB data for a mismatched assignment', () => {
  const resolver = page.slice(page.indexOf('function activateAssignedService'), page.indexOf('export default function ClientMaster'));
  assert.match(resolver, /allowLegacy && hasDataCpcb/);
  assert.match(resolver, /allowLegacy && hasDataScreenshots/);
  assert.doesNotMatch(resolver, /if \(hasData\) return dataFallback/);
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

test('Add Client draft lookup never treats populated Lead service ids as record identity', () => {
  const lookup = page.slice(page.indexOf('function findClientDraftForLead'), page.indexOf('function handleLeadSelect'));
  assert.match(lookup, /getClientRecordAssignedServiceIds\(item\)/);
  assert.doesNotMatch(lookup, /item\.selectedLead\.serviceSelections/);
});

test('Client Master service chooser removes business-identical duplicate services', () => {
  assert.match(page, /function clientMasterServiceFingerprint\(service = \{\}\)/);
  assert.match(page, /function uniqueClientMasterServices\(services = \[\]\)/);
  assert.match(page, /return uniqueClientMasterServices\(rows\)\.map/);
  assert.match(page, /service\.plantUnit/);
  const fingerprint = page.slice(page.indexOf('function clientMasterServiceFingerprint'), page.indexOf('function uniqueClientMasterServices'));
  assert.doesNotMatch(fingerprint, /firstAnnualReturnYearApplicable|servicesForYear|financialYear/);
});
