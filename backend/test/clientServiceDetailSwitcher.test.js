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
