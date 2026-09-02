const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeClientMasterData } = require('../src/services/userProductivityReport');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
const sections = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterFormSections.jsx'), 'utf8');

test('Tyre Waste Recycler uses its six Company Overview output categories', () => {
  for (const value of ['Reclaimed Rubber', 'Crumb Rubber', 'Crumb Rubber Modified Bitumen (CRMB)', 'Recovered Carbon Black', 'Pyrolysis Oil', 'Pyrolysis Char']) {
    assert.match(page, new RegExp(value.replace(/[()]/g, '\\$&')));
  }
  assert.match(page, /isTyreWasteRecyclerClient/);
  assert.match(page, /tyreRecyclerCompanyOverviewCategories/);
});

test('Tyre Waste Recycler hides non-applicable documents and PFD from completion', () => {
  const base = {
    basic: { piboCategory: 'Recycler', eprCategory: 'EPR - Tyre Waste', companyType: 'Private Limited' },
    selectedLeadSnapshot: { applicantType: 'PWP' },
    compliance: { msmeApplicable: 'No' },
    cpcb: { linkedToCommonPortal: 'No' }
  };
  const analysis = analyzeClientMasterData(base);
  assert.ok(!analysis.missingFields.includes('FACTORY LICENSE Number'));
  assert.ok(!analysis.missingFields.includes('DIC DCSSI Number'));
  assert.ok(analysis.missingFields.includes('CIN Number'));
  assert.ok(!analysis.missingFields.some((label) => label.startsWith('Process Diagram')));
  assert.match(sections, /!applicability\?\.hideProcessDiagram/);
});

test('Tyre Waste Recycler makes CIN optional for firms and adds Aadhaar persistence fields', () => {
  for (const companyType of ['Partnership', 'Proprietorship']) {
    const analysis = analyzeClientMasterData({
      basic: { piboCategory: 'Recycler', eprCategory: 'EPR - Tyre Waste', companyType },
      compliance: { msmeApplicable: 'No' },
      cpcb: { linkedToCommonPortal: 'No' }
    });
    assert.ok(!analysis.missingFields.includes('CIN Number'));
    assert.ok(analysis.missingFields.includes('Authorized Person Aadhaar Card Number'));
    assert.ok(analysis.missingFields.includes('Authorized Person Aadhaar Card Document'));
  }
  assert.match(sections, /aadhaarNumber/);
  assert.match(sections, /aadhaarDocument/);
});
