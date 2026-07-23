const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BATCH_SIZE,
  isLiveApplication,
  firstAnnualReturnYear,
  uniqueIdOf,
  buildClientBatches,
  mapClientForCcp,
  extractCcpIds
} = require('../src/services/liveClientSync');

function fixtureClient(index, options = {}) {
  const uniqueId = `ATPL-${String(index + 1).padStart(4, '0')}`;
  return {
    _id: `crm-${index + 1}`,
    adminControls: { visibilityStatus: options.visibility || 'LIVE', approvalStatus: options.approvalStatus || 'PENDING' },
    data: {
      basic: { clientLegalName: `Client ${index + 1}`, ...(options.annual ? { firstAnnualReturnYear: '2023-24' } : {}) },
      importMeta: { uniqueId, leadNumber: `LEAD-${index + 1}` },
      cpcb: { status: options.cpcbStatus || '' }
    }
  };
}

const liveFixtures = Array.from({ length: 265 }, (_, index) => fixtureClient(index, { annual: index < 218 }));
const allFixtures = [...liveFixtures, fixtureClient(300, { visibility: 'DISCONTINUED' }), fixtureClient(301, { visibility: 'SUSPENDED' })];

test('canonical live client query predicate returns 265 and excludes only discontinued or suspended', () => {
  assert.equal(allFixtures.filter(isLiveApplication).length, 265);
});

test('annual return applicable metric remains separate at 218', () => {
  assert.equal(allFixtures.filter(isLiveApplication).filter(firstAnnualReturnYear).length, 218);
});

test('full synchronization source uses all live clients, not annual applicability', () => {
  const source = allFixtures.filter(isLiveApplication);
  assert.equal(source.length, 265);
  assert.equal(source.filter(firstAnnualReturnYear).length, 218);
  assert.equal(source.filter((client) => !firstAnnualReturnYear(client)).length, 47);
});

test('all 265 records are split into batches of 10', () => {
  const batches = buildClientBatches(liveFixtures, BATCH_SIZE);
  assert.equal(batches.length, 27);
  assert.ok(batches.slice(0, -1).every((batch) => batch.length === 10));
  assert.equal(batches.at(-1).length, 5);
  assert.equal(batches.flat().length, 265);
});

test('stable CRM Unique ID prevents identity drift across repeated mapping', () => {
  const first = mapClientForCcp(liveFixtures[0]);
  const second = mapClientForCcp(liveFixtures[0]);
  assert.equal(uniqueIdOf(first), 'ATPL-0001');
  assert.equal(uniqueIdOf(second), 'ATPL-0001');
  assert.equal(first.data.importMeta.ccpClientId, 'ATPL-0001');
  assert.equal(first.data.importMeta.crmClientId, 'crm-1');
  assert.deepEqual(first.data.importMeta, second.data.importMeta);
});

test('missing expected identities fail reconciliation comparison', () => {
  const ccpIds = extractCcpIds({ identities: liveFixtures.slice(0, 264).map((client) => uniqueIdOf(client)) });
  const missing = liveFixtures.map(uniqueIdOf).filter((id) => !ccpIds.includes(id));
  assert.deepEqual(missing, ['ATPL-0265']);
});

test('Cloudinary metadata persists and blank sections are omitted without base64', () => {
  const client = fixtureClient(0);
  client.data.validation = {
    documentUrls: [{ name: 'proof.pdf', url: 'https://res.cloudinary.com/demo/raw/upload/proof.pdf', secureUrl: 'https://res.cloudinary.com/demo/raw/upload/proof.pdf', publicId: 'crm/proof', storageKey: 'crm/proof', resourceType: 'raw', type: 'application/pdf', size: 123 }]
  };
  client.data.coordinating = { name: '', email: '' };
  const mapped = mapClientForCcp(client);
  assert.deepEqual(mapped.data.validation.documentUrls[0], client.data.validation.documentUrls[0]);
  assert.equal(mapped.data.coordinating, undefined);
  assert.doesNotMatch(JSON.stringify(mapped), /;base64,/i);
  client.data.validation.documentUrls.push({ name: 'bad.png', url: 'data:image/png;base64,AAAA' });
  assert.throws(() => mapClientForCcp(client), /Base64 file data is not allowed/);
});

test('CCP shared key remains backend-only', () => {
  const frontend = path.join(__dirname, '../../frontend/src');
  const files = [];
  function walk(directory) { fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : files.push(path.join(directory, entry.name))); }
  walk(frontend);
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /CCP_SHARED_API_KEY|x-ccp-api-key/i);
});

test('backend sends the existing shared credential through x-ccp-api-key', () => {
  const previousSharedApiKey = process.env.CCP_SHARED_API_KEY;
  const previousApiKey = process.env.CCP_API_KEY;
  const previousSharedSecret = process.env.CCP_SHARED_SECRET;
  delete process.env.CCP_SHARED_API_KEY;
  delete process.env.CCP_API_KEY;
  process.env.CCP_SHARED_SECRET = 'backend-only-test-key';
  delete require.cache[require.resolve('../src/utils/ccpConfig')];
  const { ccpHeaders } = require('../src/utils/ccpConfig');
  assert.equal(ccpHeaders()['x-ccp-api-key'], 'backend-only-test-key');
  if (previousSharedApiKey === undefined) delete process.env.CCP_SHARED_API_KEY; else process.env.CCP_SHARED_API_KEY = previousSharedApiKey;
  if (previousApiKey === undefined) delete process.env.CCP_API_KEY; else process.env.CCP_API_KEY = previousApiKey;
  if (previousSharedSecret === undefined) delete process.env.CCP_SHARED_SECRET; else process.env.CCP_SHARED_SECRET = previousSharedSecret;
});
