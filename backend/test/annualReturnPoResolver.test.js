const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeFinancialYear,
  normalizeServiceName,
  resolveAnnualReturnPO
} = require('../src/services/annualReturnPoResolver');

const leadId = '6a7426143e6eb1b90295ed87';
const otherLeadId = '6a7426143e6eb1b90295ed88';
const client = { _id: '6a842adf38a334ba9d8c4ff7', selectedLead: otherLeadId, data: { selectedLead: leadId, basic: { firstAnnualReturnYear: '2023-24' } } };

function lead(overrides = {}) {
  return {
    _id: leadId,
    leadCode: 'ATPL-LEAD-0004',
    firstAnnualReturnYearApplicable: '2025-26',
    serviceSelections: [
      { assignedServiceId: 'registration', servicesOffered: 'New Registration', firstAnnualReturnYearApplicable: '2023-24' },
      { assignedServiceId: 'annual', servicesOffered: 'Annual Return Filling', firstAnnualReturnYearApplicable: '2025-26' }
    ],
    assignments: [
      { assignedServiceId: 'registration', poStatus: 'received', poYearRows: [] },
      { assignedServiceId: 'annual', poStatus: 'received', poYearRows: [] }
    ],
    ...overrides
  };
}

function modelFor(document, onFind = () => {}) {
  return {
    findById(id) {
      onFind(id);
      return { select() { return this; }, async lean() { return document; } };
    },
    findOne() {
      return { select() { return this; }, async lean() { return document; } };
    }
  };
}

function annualPo(overrides = {}) {
  return {
    fy: '2025-26',
    poNumber: 'CCL/PO/HO/WOOTH/67/2026-2027',
    poFileUrl: 'https://res.cloudinary.com/example/annual-return.pdf',
    poFileName: 'Anantattva Private Limited Work order.pdf',
    services: ['Annual Return Filling'],
    ...overrides
  };
}

test('normalizes financial-year and Annual Return service naming differences', () => {
  for (const value of ['2025-26', '2025 - 26', '2025–26', 'FY 2025-26', '2025/26']) {
    assert.equal(normalizeFinancialYear(value), '2025-26');
  }
  assert.equal(normalizeServiceName('Annual Return Filling'), 'annualreturn');
  assert.equal(normalizeServiceName('Annual Return'), 'annualreturn');
});

test('resolves the matching Annual Return PO through Client Master data.selectedLead', async () => {
  const source = lead();
  source.assignments[1].poYearRows = [annualPo()];
  let queriedId = '';
  const result = await resolveAnnualReturnPO({ clientMaster: client, financialYears: ['2025-26'], LeadModel: modelFor(source, (id) => { queriedId = id; }) });
  assert.equal(queriedId, leadId);
  assert.equal(result.years[0].poStatus, 'received');
  assert.equal(result.years[0].po.number, 'CCL/PO/HO/WOOTH/67/2026-2027');
  assert.equal(result.years[0].po.source, 'lead');
});

test('does not consume a same-year PO belonging only to an unrelated service', async () => {
  const source = lead();
  source.assignments[0].poYearRows = [annualPo({ poNumber: 'REG-PO', services: ['New Registration'] })];
  const result = await resolveAnnualReturnPO({ clientMaster: client, financialYears: ['2025-26'], LeadModel: modelFor(source) });
  assert.equal(result.years[0].poStatus, 'pending');
  assert.equal(result.years[0].po, null);
});

test('returns pending only from the explicit Annual Return requirement year onward', async () => {
  const result = await resolveAnnualReturnPO({ clientMaster: client, financialYears: ['2024-25', '2025-26'], LeadModel: modelFor(lead()) });
  assert.deepEqual(result.years.map((row) => [row.fy, row.poStatus, row.poRequired]), [
    ['2024-25', 'not_required', false],
    ['2025-26', 'pending', true]
  ]);
});

test('returns controlled unlinked states for missing and deleted source Leads', async () => {
  const withoutLink = await resolveAnnualReturnPO({ clientMaster: { data: {} }, financialYears: ['2025-26'], LeadModel: modelFor(null) });
  const deleted = await resolveAnnualReturnPO({ clientMaster: client, financialYears: ['2025-26'], LeadModel: modelFor(null) });
  assert.equal(withoutLink.years[0].poStatus, 'unlinked');
  assert.equal(deleted.years[0].poStatus, 'unlinked');
});

test('deduplicates identical Annual Return POs but reports different records as a conflict', async () => {
  const duplicateLead = lead();
  duplicateLead.assignments[0].poYearRows = [annualPo()];
  duplicateLead.assignments[1].poYearRows = [annualPo()];
  const duplicate = await resolveAnnualReturnPO({ clientMaster: client, financialYears: ['2025-26'], LeadModel: modelFor(duplicateLead) });
  assert.equal(duplicate.years[0].poStatus, 'received');

  duplicateLead.assignments[1].poYearRows.push(annualPo({ poNumber: 'ANOTHER-PO', poFileUrl: 'https://example.com/another.pdf' }));
  const conflict = await resolveAnnualReturnPO({ clientMaster: client, financialYears: ['2025-26'], LeadModel: modelFor(duplicateLead) });
  assert.equal(conflict.years[0].poStatus, 'conflict');
  assert.equal(conflict.years[0].po, null);
});

test('PO resolution does not mutate existing Lead, Client Master, or Annual Return data', async () => {
  const source = lead();
  source.assignments[1].poYearRows = [annualPo()];
  const existing = { ...client, data: { ...client.data, annualReturn: { filings: { '2025-26': { draft: { existing: true } } } } } };
  const beforeClient = JSON.stringify(existing);
  const beforeLead = JSON.stringify(source);
  await resolveAnnualReturnPO({ clientMaster: existing, financialYears: ['2025-26'], LeadModel: modelFor(source) });
  assert.equal(JSON.stringify(existing), beforeClient);
  assert.equal(JSON.stringify(source), beforeLead);
});

test('preserves an existing saved Annual Return PO only as a legacy fallback', async () => {
  const existing = {
    ...client,
    data: {
      ...client.data,
      annualReturn: { filings: { '2025-26': { draft: { purchaseOrderConfirmation: {
        confirmed: true,
        rows: [{ fyYear: 'FY 2025-26', poNumber: 'LEGACY-PO', service: 'Annual Return', file: { url: 'https://example.com/legacy.pdf', name: 'legacy.pdf' } }]
      } } } } }
    }
  };
  const fallback = await resolveAnnualReturnPO({ clientMaster: existing, financialYears: ['2025-26'], LeadModel: modelFor(lead()) });
  assert.equal(fallback.years[0].poStatus, 'received');
  assert.equal(fallback.years[0].po.source, 'annual_return_legacy');

  const source = lead();
  source.assignments[1].poYearRows = [annualPo()];
  const preferred = await resolveAnnualReturnPO({ clientMaster: existing, financialYears: ['2025-26'], LeadModel: modelFor(source) });
  assert.equal(preferred.years[0].po.number, 'CCL/PO/HO/WOOTH/67/2026-2027');
  assert.equal(preferred.years[0].po.source, 'lead');
});

test('PO status API remains authenticated and UI uses loading state instead of temporary pending', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/clients.js'), 'utf8');
  const ui = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterAnnualReturn.jsx'), 'utf8');
  assert.match(routes, /annual-return\/po-status', requireAuth, clientCtrl\.getAnnualReturnPoStatus/);
  assert.match(ui, /Checking PO details\.\.\./);
  assert.match(ui, /annualReturnPoStatus/);
  assert.doesNotMatch(ui, /Frozen — PO details pending/);
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
});
