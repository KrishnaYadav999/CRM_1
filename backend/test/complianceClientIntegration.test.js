const assert = require('node:assert/strict');
const test = require('node:test');
const { requireComplianceIntegration } = require('../src/middleware/complianceIntegrationAuth');
const { createComplianceIntegrationController } = require('../src/controllers/complianceIntegrationController');

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function authRequest(secret) {
  return { get: (name) => name === 'x-crm-shared-secret' ? secret : undefined };
}

function queryResult(result) {
  const query = {
    populate() { return query; },
    sort() { return query; },
    async lean() { return result; }
  };
  return query;
}

test('compliance integration rejects missing and incorrect credentials and accepts the configured secret', () => {
  const original = process.env.CRM_COMPLIANCE_SHARED_SECRET;
  process.env.CRM_COMPLIANCE_SHARED_SECRET = 'integration-test-secret';
  try {
    for (const supplied of [undefined, 'wrong-secret']) {
      const res = responseRecorder();
      let called = false;
      requireComplianceIntegration(authRequest(supplied), res, () => { called = true; });
      assert.equal(res.statusCode, 401);
      assert.equal(called, false);
    }
    const res = responseRecorder();
    let called = false;
    requireComplianceIntegration(authRequest('integration-test-secret'), res, () => { called = true; });
    assert.equal(res.statusCode, 200);
    assert.equal(called, true);
  } finally {
    if (original === undefined) delete process.env.CRM_COMPLIANCE_SHARED_SECRET;
    else process.env.CRM_COMPLIANCE_SHARED_SECRET = original;
  }
});

test('unconfigured compliance integration returns 503', () => {
  const original = process.env.CRM_COMPLIANCE_SHARED_SECRET;
  delete process.env.CRM_COMPLIANCE_SHARED_SECRET;
  try {
    const res = responseRecorder();
    requireComplianceIntegration(authRequest('anything'), res, () => assert.fail('must not authenticate'));
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.payload, { message: 'CRM compliance integration is not configured' });
  } finally {
    if (original !== undefined) process.env.CRM_COMPLIANCE_SHARED_SECRET = original;
  }
});

test('list returns complete clients across owners without changing nested Client Master data', async () => {
  const clients = [
    { _id: '1', createdBy: { name: 'Owner One' }, data: { basic: { clientLegalName: 'One' }, cpcb: { loginId: 'one' } } },
    { _id: '2', createdBy: { name: 'Owner Two' }, data: { basic: { clientLegalName: 'Two' }, authorised: { name: 'Person' } } }
  ];
  let receivedFilter;
  const controller = createComplianceIntegrationController({ find(filter) { receivedFilter = filter; return queryResult(clients); } });
  const res = responseRecorder();
  await controller.listClients({}, res);
  assert.deepEqual(receivedFilter, {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'crm');
  assert.equal(res.payload.clients.length, 2);
  assert.deepEqual(res.payload.clients[0].data.cpcb, { loginId: 'one' });
  assert.deepEqual(res.payload.clients[1].data.authorised, { name: 'Person' });
});

test('detail returns the requested client and invalid or missing ids return 404', async () => {
  const id = '64b000000000000000000001';
  const stored = { _id: id, data: { selectedLeadSnapshot: { company: 'MBR FLEXIBLES LTD' } } };
  const controller = createComplianceIntegrationController({ findById(value) { return queryResult(value === id ? stored : null); } });
  const found = responseRecorder();
  await controller.getClient({ params: { id } }, found);
  assert.equal(found.statusCode, 200);
  assert.deepEqual(found.payload.client.data, stored.data);

  for (const missingId of ['invalid-id', '64b000000000000000000002']) {
    const res = responseRecorder();
    await controller.getClient({ params: { id: missingId } }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.payload, { message: 'Client not found' });
  }
});
