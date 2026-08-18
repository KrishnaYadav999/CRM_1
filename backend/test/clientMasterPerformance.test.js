const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');

test('Client Master discovery reads only lightweight identity metadata', () => {
  const catalog = controller.slice(
    controller.indexOf('exports.listClientMasterCatalog'),
    controller.indexOf('exports.getClient')
  );
  assert.match(catalog, /\.select\(\[/);
  assert.match(catalog, /data\.basic\.clientLegalName/);
  assert.match(catalog, /data\.selectedLeadSnapshot/);
  assert.match(catalog, /\.lean\(\)/);
  assert.doesNotMatch(catalog, /records: clientMasters\.map/);
  assert.doesNotMatch(catalog, /cpcbScreenshots|processDiagrams|loginPassword|ceprPassword/);
});

test('Client Master directory renders before secondary history APIs finish', () => {
  const loader = page.slice(page.indexOf('async function loadPage'), page.indexOf('function setValue'));
  const renderReadyAt = loader.indexOf('setLoading(false)');
  const secondaryAt = loader.indexOf('void Promise.allSettled');
  assert.ok(renderReadyAt > -1 && secondaryAt > renderReadyAt);
  assert.match(loader, /pageLoadId !== pageLoadRequestRef\.current/);
  assert.match(loader, /setClients\(visibleClients\)/);
  assert.ok(loader.indexOf('setLoading(false)') < loader.indexOf('api.get(API_ENDPOINTS.auth.users)'));
  assert.doesNotMatch(loader, /API_ENDPOINTS\.leads\.list/);
  assert.doesNotMatch(loader, /API_ENDPOINTS\.clients\.catalog/);
});

test('Add Client uses bounded debounced server-side discovery', () => {
  assert.match(page, /clientSearchQuery\.trim\(\)/);
  assert.match(page, /query\.length < 2/);
  assert.match(page, /window\.setTimeout\(async \(\) => \{/);
  assert.match(page, /\}, 400\)/);
  assert.match(page, /AbortController/);
  assert.match(page, /API_ENDPOINTS\.clients\.discoverySearch/);
  assert.match(page, /params: \{ q: query, limit: 20 \}/);
  assert.match(page, /API_ENDPOINTS\.clients\.discoveryServices/);
  assert.match(page, /await handleLeadSelect\(getLeadSelectValue\(baseLead\), null, baseLead\)/);
});

test('Server discovery is projected, capped, and supports legacy and modern Client Master shapes', () => {
  const search = controller.slice(
    controller.indexOf('exports.searchClientMasterCompanies'),
    controller.indexOf('exports.listClientMasterServices')
  );
  const services = controller.slice(
    controller.indexOf('exports.listClientMasterServices'),
    controller.indexOf('exports.getClient')
  );
  assert.match(search, /query\.length < 2/);
  assert.match(search, /Math\.min\(30/);
  assert.match(search, /\.select\('_id leadCode sourceLeadId company companyIdentity'\)/);
  assert.match(search, /\.limit\(limit\)/);
  assert.doesNotMatch(search, /serviceSelections addresses contacts assignments/);
  assert.match(services, /Client\.collection\.find/);
  assert.match(services, /selectedLead: \{ \$in: candidates \}/);
  assert.match(services, /'data\.selectedLead': \{ \$in: candidates \}/);
  assert.match(services, /records\.map\(normalizeClientMaster\)/);
});

test('Client directory query excludes heavy files and only populates lead summary fields', () => {
  const list = controller.slice(controller.indexOf('exports.listClients'), controller.indexOf('exports.listClientMasterCatalog'));
  assert.match(list, /-data\.cpcbScreenshots/);
  assert.match(list, /-data\.processDiagrams/);
  assert.match(list, /-data\.cpcbDataByAssignedServiceId/);
  assert.match(list, /populate\('selectedLead', 'leadCode company status'\)/);
  assert.match(list, /\.lean\(\)/);
  assert.doesNotMatch(list, /serviceSelections addresses contacts assignments/);
});
