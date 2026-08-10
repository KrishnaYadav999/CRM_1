const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Quotation dropdown includes custom Lead business categories and schemas allow them', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/quotationController.js'), 'utf8');
  const quotationModel = fs.readFileSync(path.resolve(__dirname, '../src/models/Quotation.js'), 'utf8');
  const proformaModel = fs.readFileSync(path.resolve(__dirname, '../src/models/ProformaInvoice.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');

  assert.match(controller, /LeadDropdownOption\.find\(\{ field: 'businessCategory' \}\)/);
  assert.doesNotMatch(quotationModel, /businessCategory: \{[^\n]*enum: \['EPR Consultancy', 'EPR Credit'\]/);
  assert.doesNotMatch(proformaModel, /businessCategory: \{[^\n]*enum: \['EPR Consultancy', 'EPR Credit'\]/);
  assert.match(page, /leadBusinessCategories/);
  assert.match(page, /\.\.\.leadBusinessCategories/);
});
