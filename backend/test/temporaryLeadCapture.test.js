const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');

test('temporary lead capture requires contact details and blocks duplicates before insertion', () => {
  const controller = read('../src/controllers/temporaryLeadController.js');
  const model = read('../src/models/TemporaryLead.js');
  assert.match(controller, /validateTemporaryLeadPayload/);
  assert.match(controller, /DUPLICATE_TEMPORARY_LEAD/);
  assert.match(controller, /findTemporaryLeadDuplicate/);
  assert.match(controller, /emailIdentity/);
  assert.match(controller, /phoneIdentity/);
  assert.match(model, /personName:/);
  assert.match(model, /sector:/);
});

test('temporary lead Excel import uses the same record creation and duplicate checks', () => {
  const controller = read('../src/controllers/temporaryLeadController.js');
  const routes = read('../src/routes/leads.js');
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');
  assert.match(routes, /post\('\/temporary\/bulk'/);
  assert.match(controller, /createTemporaryLeadRecord\(rows\[index\], req\.user\)/);
  assert.match(page, /Bulk Upload Excel/);
  assert.match(page, /temporary-leads-template-/);
  assert.match(page, /Complete lead details/);
});

test('temporary lead conversion preserves the captured contact fields', () => {
  const controller = read('../src/controllers/temporaryLeadController.js');
  assert.match(controller, /contactPerson: row\.personName/);
  assert.match(controller, /emails: row\.email/);
  assert.match(controller, /mobileNo1: row\.phone/);
  assert.match(controller, /industryType: row\.sector/);
});
