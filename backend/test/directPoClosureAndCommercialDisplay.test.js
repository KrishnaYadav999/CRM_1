const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = fs.readFileSync(require('node:path').resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
const quoteSource = fs.readFileSync(require('node:path').resolve(__dirname, '../../frontend/src/utils/leadClosureQuotation.js'), 'utf8');
const quoteModule = import(`data:text/javascript;base64,${Buffer.from(quoteSource).toString('base64')}`);
const request = page.slice(page.indexOf('  function requestLeadClosure('), page.indexOf('  async function uploadClosureFile'));
const opening = page.slice(page.indexOf('  function openLeadPoDetails('), page.indexOf('  const renderClosureDialog ='));
async function open(source, quotations) {
  const { hydrateClosurePoRows, selectLeadClosureQuotation } = await quoteModule;
  const state = {};
  const context = { source, quotations, lead: { _id: 'previous-lead' }, currentUser: { _id: 'user-1' }, staff: [], emptyLead: {}, hydrateClosurePoRows, selectLeadClosureQuotation,
    normalizeLegacyServiceSelections: (lead) => lead.serviceSelections,
    primaryLeadOwner: () => ({ id: 'owner-1', name: 'Owner' }),
    setLead: (value) => { state.lead = value; }, setEditingLeadId: (value) => { state.id = value; },
    setClosureDialog: (value) => { state.dialog = typeof value === 'function' ? value(state.dialog) : value; }, updateAssignmentRow: () => {} };
  vm.runInNewContext(request + opening + '\nopenLeadPoDetails(source);', context);
  return state;
}
test('direct PO entry opens shared closure workflow with matching quotation and persisted commercial values', async () => {
  const source = { _id: 'lead-1', serviceSelections: [{ assignedServiceId: 'svc-1', servicesOffered: 'Annual Filing', firstAnnualReturnYearApplicable: '2026-27' }], assignments: [{ assignedServiceId: 'svc-1', poYearRows: [{ poNumber: 'PO-100', poEndDate: '2027-03-31', poFinancialYear: '2026-27', paymentTerm: '45 days' }] }] };
  const state = await open(source, [
    { _id: 'wrong', leadId: 'other-lead', updatedAt: '2026-10-02', items: [{ assignedServiceId: 'svc-1' }] },
    { _id: 'correct', leadId: 'lead-1', items: [{ assignedServiceId: 'svc-1', financialYear: '2026-27', servicesOffered: 'Annual Filing', basicAmount: 1000 }] }
  ]);
  assert.equal(state.id, 'lead-1'); assert.equal(state.dialog.quotation._id, 'correct');
  assert.equal(state.dialog.poEditor, true); assert.equal(state.dialog.choice, 'yes'); assert.equal(state.dialog.quotationSent, 'yes');
  assert.equal(state.dialog.poYearRows[0].paymentTerm, '45 days');
  assert.equal(state.dialog.poYearRows[0].poEndDate, '2027-03-31');
  assert.equal(state.dialog.poYearRows[0].poFinancialYear, '2026-27');
});
test('manual PO entry retains earlier quotation proof and service period when reopened directly', async () => {
  const source = { _id: 'lead-2', serviceSelections: [{ assignedServiceId: 'svc-2', servicesOffered: 'Registration', firstAnnualReturnYearApplicable: '2026-27' }], assignments: [{ quotationSent: 'no', earlierQuotationProofUrl: 'https://example.com/quote.pdf', earlierQuotationProofName: 'quote.pdf' }] };
  const state = await open(source, []);
  assert.equal(state.dialog.quotationSent, 'no');
  assert.equal(state.dialog.earlierQuotationProofUrl, 'https://example.com/quote.pdf');
  assert.equal(state.dialog.poYearRows[0].fy, '2026-27');
  assert.equal(state.dialog.poYearRows[0].services[0], 'Registration');
});
test('selected Annual Return service overrides a stale New Registration label without losing PO values', async () => {
  const source = { _id: 'lead-0386', serviceSelections: [
    { assignedServiceId: 'annual-importer', subApplicantType: 'Importer', servicesOffered: 'Annual Return Filling', firstAnnualReturnYearApplicable: '2024-25' },
    { assignedServiceId: 'annual-brand', subApplicantType: 'Brand Owner', servicesOffered: 'Annual Return Filling', firstAnnualReturnYearApplicable: '2024-25' },
    { assignedServiceId: 'registration', servicesOffered: 'New Registration', firstAnnualReturnYearApplicable: '2026-27' }
  ], assignments: [
    { assignedServiceId: 'annual-importer', quotationSent: 'no', poYearRows: [{ fy: '2026-27', services: ['New Registration'], poNumber: '2025090099', poAmount: 50000, poFileUrl: 'proof.pdf' }] },
    { assignedServiceId: 'annual-brand' }, { assignedServiceId: 'registration' }
  ] };
  const state = await open(source, []);
  assert.equal(state.dialog.poYearRows[0].services[0], 'Annual Return Filling');
  assert.equal(state.dialog.poYearRows[0].fy, '2024-25');
  assert.equal(state.dialog.poYearRows[0].poNumber, '2025090099');
  assert.equal(state.dialog.poYearRows[0].poAmount, 50000);
  assert.equal(state.dialog.poYearRows[0].poFileUrl, 'proof.pdf');
});
test('dashboard PO details preserve explicit PO financial year separately from the service period', () => {
  const admin = fs.readFileSync(require('node:path').resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx'), 'utf8');
  const source = admin.slice(admin.indexOf('function getCompliancePoDetails('), admin.indexOf('function getPerformanceTone('));
  const po = { poNumber: 'PO-100', fy: '2025-26', poFinancialYear: '2026-27', poEndDate: '2027-03-31', paymentTerm: '30 days' };
  const context = { po, readClientData: () => ({}), getLeadPurchaseOrder: () => po, getPoValue: (...values) => values.find(Boolean) || '', getAnnualReturnDraftValue: () => '', getFileDisplayValue: () => '', getFileUrl: () => '' };
  vm.runInNewContext(source + '\nresult = getCompliancePoDetails({}, [], [], []);', context);
  assert.equal(context.result.poEndDate, '2027-03-31'); assert.equal(context.result.poFinancialYear, '2026-27'); assert.equal(context.result.paymentTerm, '30 days');
});
