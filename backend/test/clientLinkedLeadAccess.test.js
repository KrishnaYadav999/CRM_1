const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');

test('Client Master access includes records linked to Leads visible to the CRM user', () => {
  const accessBlock = controller.slice(
    controller.indexOf('async function clientAccessFilter'),
    controller.indexOf('async function leadAccessFilter')
  );

  assert.match(accessBlock, /Lead\.find\(leadOwnerFilter\(scope\)\)/);
  assert.match(accessBlock, /selectedLead: \{ \$in: leadIds \}/);
  assert.match(accessBlock, /data\.selectedLeadSnapshot\.leadCode/);
  assert.match(accessBlock, /directClientAccess\.\$or/);
});

test('Client list and catalog use the same linked-Lead access policy as detail', () => {
  const listBlock = controller.slice(controller.indexOf('exports.listClients'), controller.indexOf('exports.listClientMasterCatalog'));
  const catalogBlock = controller.slice(controller.indexOf('exports.listClientMasterCatalog'), controller.indexOf('function escapeSearchRegex'));

  assert.match(listBlock, /await clientAccessFilter\(req\.user\)/);
  assert.match(catalogBlock, /Client\.find\(await clientAccessFilter\(req\.user\)\)/);
});
