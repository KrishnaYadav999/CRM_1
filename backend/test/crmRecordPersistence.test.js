const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCompanyIdentity,
  recordFromPayload,
  externalId
} = require('../src/services/crmRecordPersistence');

test('CRM company identity is stable across legal-name variants', () => {
  assert.equal(
    normalizeCompanyIdentity('Pinnacle Industries Private Limited'),
    normalizeCompanyIdentity('PINNACLE INDUSTRIES PVT LTD')
  );
});

test('CCP response wrappers resolve to the saved business record', () => {
  const lead = { _id: 'ccp-lead-1', company: 'Pinnacle Industries Ltd' };
  assert.equal(recordFromPayload({ data: { lead } }, ['lead']), lead);
  assert.equal(recordFromPayload({ lead }, ['lead']), lead);
});

test('stable external id supports CCP response variants', () => {
  assert.equal(externalId({ _id: 'mongo-id' }), 'mongo-id');
  assert.equal(externalId({ ccpClientId: 'client-id' }), 'client-id');
  assert.equal(externalId({}, 'fallback-id'), 'fallback-id');
});
