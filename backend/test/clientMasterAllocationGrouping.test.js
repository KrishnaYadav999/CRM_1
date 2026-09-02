const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMasterAllocate.jsx'), 'utf8');

test('allocation modal groups sibling Client Masters by selected lead', () => {
  assert.match(page, /function clientAllocationGroupIdentity/);
  assert.match(page, /clientAllocationGroupIdentity\(candidate\) === groupIdentity/);
  assert.match(page, /groupedClients\.flatMap/);
  assert.match(page, /__allocationClientId/);
});

test('duplicate service labels keep independent allocation state and database writes', () => {
  assert.match(page, /function allocationStateKey\(clientId, serviceKey\)/);
  assert.match(page, /allocationsByClient = new Map/);
  assert.match(page, /API_ENDPOINTS\.clients\.allocations\(clientId\)/);
  assert.match(page, /await Promise\.all\(requests\)/);
  assert.match(page, /Database verification failed for client/);
  assert.match(page, /row\.stateKey/);
});
