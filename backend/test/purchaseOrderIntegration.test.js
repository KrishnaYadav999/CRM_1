const assert = require('node:assert/strict');
const test = require('node:test');
const { createPurchaseOrderController, inferMimeType } = require('../src/controllers/purchaseOrderController');

function Model(rows) {
  return { find() { return { async lean() { return rows; } }; } };
}

function responseRecorder() {
  return {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

const leadId = '64b000000000000000000001';
const clientId = '64b000000000000000000002';
const quotationId = '64b000000000000000000003';
const data = {
  leads: [{
    _id: leadId, leadCode: 'ATPL-LEAD-0278', closedAt: '2026-08-14T10:00:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-15T10:00:00.000Z',
    assignments: [
      { closedAt: '2026-08-14T10:00:00.000Z', poYearRows: [
        { fy: '2026-27', poNumber: 'PO-2026-001', poAmount: 50000, currency: 'INR', services: ['Credit Procurements', { id: 'service-2', name: 'Registration' }], quotationId, quotationNumber: 'QT-2026-001', poFileUrl: 'https://files.example/po.pdf', poFileName: 'po.pdf', poFileSize: 125000, poReceivedDate: '2026-08-14T10:00:00.000Z' },
        { fy: '2027-28', poNumber: 'PO-2027-002', services: ['Annual Return'], quotationId, poFileUrl: 'https://files.example/scan.JPG', poFileName: 'scan.JPG' }
      ] },
      { poYearRows: [{ fy: '2028-29', poNumber: 'SECOND-ASSIGNMENT', services: ['Audit'] }] }
    ]
  }],
  clients: [{ _id: clientId, selectedLead: leadId }],
  quotations: [{ _id: quotationId, leadRef: leadId, quotationNumber: 'QT-2026-001', grandTotal: 88000 }]
};

function controller() {
  return createPurchaseOrderController({ Lead: Model(data.leads), Client: Model(data.clients), Quotation: Model(data.quotations) });
}

test('list maps nested assignments and PO rows, services, proof metadata and quotation fallback', async () => {
  const res = responseRecorder();
  await controller().list({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.pagination.total, 3);
  const first = res.payload.data.find((row) => row.poNumber === 'PO-2026-001');
  assert.equal(first.leadNumber, 'ATPL-LEAD-0278');
  assert.equal(first.clientId, clientId);
  assert.equal(first.poAmount, 50000);
  assert.deepEqual(first.services, [{ id: null, name: 'Credit Procurements' }, { id: 'service-2', name: 'Registration' }]);
  assert.deepEqual(first.service, { id: null, name: 'Credit Procurements' });
  assert.equal(first.poProof.mimeType, 'application/pdf');
  assert.equal(first.poProof.size, 125000);
  const legacy = res.payload.data.find((row) => row.poNumber === 'PO-2027-002');
  assert.equal(legacy.poAmount, 88000);
  assert.equal(legacy.poProof.mimeType, 'image/jpeg');
  assert.equal(legacy.poProof.size, null);
});

test('list supports all filters and bounded pagination', async () => {
  const filters = { leadId, clientId, quotationId, poNumber: '2026', page: '1', limit: '1' };
  const res = responseRecorder();
  await controller().list({ query: filters }, res);
  assert.equal(res.payload.pagination.total, 1);
  assert.equal(res.payload.pagination.limit, 1);
  assert.equal(res.payload.data[0].poNumber, 'PO-2026-001');
});

test('single endpoint returns a stable record and returns 404 for unknown ids', async () => {
  const listResponse = responseRecorder();
  await controller().list({ query: {} }, listResponse);
  const id = listResponse.payload.data[0].id;
  const found = responseRecorder();
  await controller().getOne({ params: { id } }, found);
  assert.equal(found.statusCode, 200);
  assert.equal(found.payload.data.id, id);

  const missing = responseRecorder();
  await controller().getOne({ params: { id: 'po_missing' } }, missing);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.payload, { success: false, message: 'Purchase order not found' });
});

test('safe MIME inference only returns known types', () => {
  assert.equal(inferMimeType('document.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(inferMimeType('unknown.exe'), null);
  assert.equal(inferMimeType('whatever', 'application/custom'), 'application/custom');
});
