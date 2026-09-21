const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _test } = require('../src/controllers/leadController');

test('Solid Waste Management clears stale PIBO fields and accepts its direct applicant type', () => {
  const cleaned = _test.cleanBody({
    eprCategory: 'Solid Waste Management',
    applicantType: 'Bulk Waste Generator',
    piboParent: 'PIBO',
    piboCategory: 'Brand Owner'
  });

  assert.equal(_test.usesDirectApplicantType(cleaned.eprCategory), true);
  assert.equal(cleaned.applicantType, 'Bulk Waste Generator');
  assert.equal(cleaned.piboParent, undefined);
  assert.equal(cleaned.subApplicantType, '');
});

test('lead submit payload explicitly clears PIBO fallbacks for direct-applicant services', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
  const payloadBlock = page.slice(page.indexOf('function buildLeadPayload'), page.indexOf('async function saveLead'));

  assert.match(payloadBlock, /primaryUsesDirectApplicant = Boolean\(directApplicantOptions\(primaryService\.eprCategory\)\)/);
  assert.match(payloadBlock, /piboCategory: primaryUsesDirectApplicant \? ''/);
  assert.match(payloadBlock, /subApplicantType: primaryUsesDirectApplicant \? ''/);
  assert.match(payloadBlock, /piboParent: primaryUsesDirectApplicant \? ''/);
});
