const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Client Master directory groups service rows into one company row', () => {
  const source = read('frontend/src/features/clientMaster/ClientDirectoryView.jsx');
  assert.match(source, /function dedupeDirectoryClients/);
  assert.match(source, /getClientUniqueId\(item\)/);
  assert.match(source, /const directoryClients = useMemo\(\(\) => dedupeDirectoryClients\(clients\)/);
  assert.match(source, /return directoryClients\.filter/);
});

test('detail view preserves discovered services and renders the requested detail order', () => {
  const source = read('frontend/src/pages/ClientMaster.jsx');
  assert.match(source, /setViewServiceClients\(relatedServices\)/);
  assert.match(source, /serviceClients=\{viewServiceClients\.length \? viewServiceClients/);
  const basicIndex = source.indexOf('Currently Selected Service');
  const sharedIndex = source.indexOf('Shared Compliance Documents', basicIndex);
  assert.ok(basicIndex >= 0 && sharedIndex > basicIndex);
  assert.match(source, /\['GST Number'[\s\S]*\['GST Certificate Date'/);
  assert.match(source, /\['PAN'[\s\S]*\['PAN Document Date'/);
  assert.match(source, /\['CIN'[\s\S]*\['CIN Document Date'/);
});

test('service chooser includes secure CEPR credential controls', () => {
  const frontend = read('frontend/src/pages/ClientMaster.jsx');
  const controller = read('backend/src/controllers/clientController.js');
  const resolver = read('backend/src/services/clientMasterResolver.js');
  assert.match(frontend, /CEPR ID:/);
  assert.match(frontend, /View CEPR password/);
  assert.match(frontend, /EyeOff/);
  assert.match(controller, /data\.cpcb\.ceprUserId/);
  assert.match(controller, /data\.cpcb\.ceprPassword/);
  assert.match(resolver, /ceprUserId:/);
  assert.match(resolver, /ceprPassword:/);
});
