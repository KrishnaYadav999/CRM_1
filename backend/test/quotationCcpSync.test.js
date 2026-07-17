const test = require('node:test');
const assert = require('node:assert/strict');
const quotationController = require('../src/controllers/quotationController');
const fs = require('node:fs');
const path = require('node:path');

test('every revised quotation maps to a fresh pending approval request', () => {
  const row = quotationController.mapQuotationPendingApprovalRow({
    _id: '64b000000000000000000001',
    quotationNumber: 'AT/26-27/001',
    status: 'draft',
    leadDetails: { companyName: 'Updated Company' },
    items: []
  }, 'UPDATE');
  assert.equal(row.approvalStatus, 'PENDING');
  assert.equal(row.approvalType, 'UPDATE');
});

test('quotation approval endpoints are restricted to admin roles', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/quotations.js'), 'utf8');
  assert.match(routes, /approve-all[^\n]+requireRoles\(ADMIN_ROLES\)/);
  assert.match(routes, /:id\/approval[^\n]+requireRoles\(ADMIN_ROLES\)/);
});

test('company normalization treats common legal suffix variants consistently', () => {
  const { normalizeCompanyName } = quotationController._test;
  assert.equal(normalizeCompanyName('Example Pvt. Ltd.'), normalizeCompanyName('Example Private Limited'));
  assert.equal(normalizeCompanyName('A & B LLP'), normalizeCompanyName('A and B L.L.P.'));
});

test('CCP quotation mapping preserves CCP identity and calculates totals', () => {
  const mapped = quotationController._test.mapCcpQuotation({
    _id: 'ccp-quotation-1',
    selectedLead: { _id: 'ccp-lead-1', leadCode: 'LD-1', company: 'Example Pvt Ltd', contactPerson: 'A User' },
    quotationNumber: 'Q-1',
    items: [{ id: 'i1', unit: 2, unitLabel: 'Nos', basicAmount: 1250 }],
    source: 'bulk', status: 'submitted'
  }, { _id: 'crm-lead-1', leadCode: 'LD-1', company: 'Example Private Limited', contactPerson: 'A User' });

  assert.equal(mapped.ccpQuotationId, 'ccp-quotation-1');
  assert.equal(mapped.leadId, 'crm-lead-1');
  assert.equal(mapped.ccpLeadId, 'ccp-lead-1');
  assert.equal(mapped.grandTotal, 2500);
  assert.equal(mapped.items[0].unitLabel, 'Nos');
  assert.equal(mapped.source, 'CCP');
  assert.equal(mapped.ccpSource, 'bulk');
});

test('CCP quotation URL is built from the configured deployment base URL', () => {
  const previousUrl = process.env.CCP_API_URL;
  const previousBase = process.env.CCP_API_BASE_URL;
  process.env.CCP_API_URL = 'https://ccp.example.com/';
  delete process.env.CCP_API_BASE_URL;
  try {
    assert.equal(quotationController._test.ccpQuotationUrl(), 'https://ccp.example.com/api/ccp/quotations');
  } finally {
    if (previousUrl === undefined) delete process.env.CCP_API_URL; else process.env.CCP_API_URL = previousUrl;
    if (previousBase === undefined) delete process.env.CCP_API_BASE_URL; else process.env.CCP_API_BASE_URL = previousBase;
  }
});

test('CCP credential is used only in backend request headers', () => {
  const previous = process.env.CCP_API_KEY;
  process.env.CCP_API_KEY = 'server-secret';
  try {
    const headers = quotationController._test.ccpRequestHeaders();
    assert.equal(headers['x-ccp-api-key'], 'server-secret');
    assert.equal(headers['x-ccp-secret'], 'server-secret');
  } finally {
    if (previous === undefined) delete process.env.CCP_API_KEY;
    else process.env.CCP_API_KEY = previous;
  }
});
