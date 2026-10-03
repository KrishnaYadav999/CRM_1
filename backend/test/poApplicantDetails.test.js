const test = require('node:test');
const assert = require('node:assert/strict');

test('manual PO resolves applicant and sub-applicant independently from its service snapshot', async () => {
  const { resolvePoApplicantDetails } = await import('../../frontend/src/utils/poApplicantDetails.mjs');
  assert.deepEqual(resolvePoApplicantDetails({ payload: { service: { piboParent: 'PIBO', piboCategory: 'Producer' } } }), { applicant: 'PIBO', subApplicant: 'Producer' });
});

test('row-specific quotation applicant takes priority over generic approval fields', async () => {
  const { resolvePoApplicantDetails } = await import('../../frontend/src/utils/poApplicantDetails.mjs');
  const approval = { payload: { service: { applicantType: 'PIBO', subApplicantType: 'Producer' } } };
  assert.deepEqual(resolvePoApplicantDetails(approval, { quotationItems: [{ applicantType: 'SIMP', subApplicantType: 'Importer of Raw Material' }] }), { applicant: 'SIMP', subApplicant: 'Importer of Raw Material' });
  assert.deepEqual(resolvePoApplicantDetails(approval, { applicantType: 'PWP', subApplicantType: 'Recycler' }), { applicant: 'PWP', subApplicant: 'Recycler' });
});

test('missing or malformed applicant information is not inferred from the sub-applicant', async () => {
  const { resolvePoApplicantDetails } = await import('../../frontend/src/utils/poApplicantDetails.mjs');
  assert.deepEqual(resolvePoApplicantDetails({ payload: { service: 'Consulting', applicantType: {}, subApplicantType: 'Producer' } }), { applicant: 'Not recorded', subApplicant: 'Producer' });
});
