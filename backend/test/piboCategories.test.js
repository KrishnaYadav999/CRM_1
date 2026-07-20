const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PIBO_PARENTS,
  BUILT_IN_PIBO_CATEGORIES,
  inferPiboParent,
  normalizeLegacyPiboCategory,
  normalizedCategoryName,
  validatePiboSelection
} = require('../src/utils/piboCategories');

test('PIBO hierarchy exposes only the three allowed parents and exact children', () => {
  assert.deepEqual(PIBO_PARENTS, ['PIBO', 'SIMP', 'PWP']);
  assert.deepEqual(BUILT_IN_PIBO_CATEGORIES.PIBO, ['Producer', 'Brand Owner', 'Importer']);
  assert.deepEqual(BUILT_IN_PIBO_CATEGORIES.SIMP, ['Producer (Small & Micro)', 'Importer of Raw Material', 'Manufacturer of Raw Material', 'Seller']);
  assert.deepEqual(BUILT_IN_PIBO_CATEGORIES.PWP, ['PWP', 'Recycler', 'Refurbisher', 'Waste to Energy', 'Waste to Oil', 'Cement Co-processing']);
});

test('actual Excel legacy PIBO codes normalize without losing their meaning', async () => {
  const expected = {
    PRODUCER: ['PIBO', 'Producer'],
    'BRAND OWNER': ['PIBO', 'Brand Owner'],
    IMPORTER: ['PIBO', 'Importer'],
    PWP: ['PWP', 'PWP'],
    RECYCLER: ['PWP', 'Recycler'],
    REFURBISHER: ['PWP', 'Refurbisher'],
    SIMP_PRODUCER: ['SIMP', 'Producer (Small & Micro)'],
    SIMP_IMPORTER_RAW: ['SIMP', 'Importer of Raw Material'],
    SIMP_MANUFACTURER_RAW: ['SIMP', 'Manufacturer of Raw Material'],
    SIMP_SELLER: ['SIMP', 'Seller']
  };
  for (const [raw, [parent, child]] of Object.entries(expected)) {
    assert.deepEqual(normalizeLegacyPiboCategory(raw), { parent, child });
    assert.deepEqual(await validatePiboSelection({ child: raw }), { piboParent: parent, piboCategory: child });
  }
});

test('legacy flat values infer their parent', () => {
  assert.equal(inferPiboParent('Brand Owner'), 'PIBO');
  assert.equal(inferPiboParent('SIMP – Seller'), 'SIMP');
  assert.equal(inferPiboParent('Recycler'), 'PWP');
});

test('normalized custom category key is parent scoped and case insensitive', () => {
  assert.equal(normalizedCategoryName('PWP', ' Custom Category '), 'pwp:custom category');
  assert.notEqual(normalizedCategoryName('PWP', 'Shared'), normalizedCategoryName('PIBO', 'Shared'));
});

test('built-in selection validation rejects invalid parent-child combinations', async () => {
  assert.deepEqual(await validatePiboSelection({ parent: 'PWP', child: 'Recycler' }), { piboParent: 'PWP', piboCategory: 'Recycler' });
  await assert.rejects(() => validatePiboSelection({ parent: 'PIBO', child: 'Recycler' }), /belongs to PWP, not PIBO/);
  await assert.rejects(() => validatePiboSelection({ parent: 'OTHER', child: 'Recycler' }), /Applicant Type must be PIBO, SIMP, or PWP/);
});

test('both forms use the shared dependent selector and piboParent contract', () => {
  const root = path.resolve(__dirname, '../../frontend/src/pages');
  const lead = fs.readFileSync(path.join(root, 'LeadGeneration.jsx'), 'utf8');
  const quotation = fs.readFileSync(path.join(root, 'Quotations.jsx'), 'utf8');
  assert.match(lead, /PiboDependentSelect/);
  assert.match(quotation, /PiboDependentSelect/);
  assert.match(lead, /piboParent/);
  assert.match(quotation, /piboParent/);
});
