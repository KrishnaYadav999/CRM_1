const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _test } = require('../src/controllers/proformaInvoiceController');

test('proforma payload preserves quotation, PO and calculated item totals', () => {
  const payload = _test.cleanPayload({
    quotationNumber: 'AT/26-27/292', poNumber: 'PO-1001',
    leadDetails: { companyName: 'Example Limited', contactPerson: 'Krishna' },
    items: [{ serviceCategory: 'CONSULTANCY FEE', unit: '2', basicAmount: '30000' }]
  });
  assert.equal(payload.quotationNumber, 'AT/26-27/292');
  assert.equal(payload.poNumber, 'PO-1001');
  assert.equal(payload.companyName, 'Example Limited');
  assert.equal(payload.grandTotal, 60000);
});

test('proforma routes require CRM authentication and are mounted', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/proformaInvoices.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(routes, /router\.get\('\/', requireAuth/);
  assert.match(routes, /router\.post\('\/', requireAuth/);
  assert.match(app, /app\.use\('\/api\/proforma-invoices', proformaInvoiceRoutes\)/);
});
