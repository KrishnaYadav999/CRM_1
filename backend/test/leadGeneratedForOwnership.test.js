const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Other User lead ownership is persisted separately from the actual creator', () => {
  const model = fs.readFileSync(path.resolve(__dirname, '../src/models/Lead.js'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
  assert.match(model, /generatedForUser: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'User'/);
  assert.match(controller, /'generatedForUser'/);
  assert.match(page, /generatedForUser: generatedForOwnerId/);
  assert.match(page, /createdByCrmUserId: index < frozenServiceRowCount/);
  assert.match(page, /String\(actualCreatorId\)/);
  assert.match(controller, /createdBy: user\?\._id/);
  assert.match(controller, /populate\('generatedForUser', 'name email'\)/);
});

test('Lead staff filter matches current, generated-for, assignment and legacy owner identities', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
  assert.match(controller, /populate\('generatedForUser', 'name email crmUserId'\)/);
  assert.match(page, /function leadStaffIdentityTokens/);
  assert.match(page, /item\.generatedForUser, item\.generatedForName, item\.generatedForEmail/);
  assert.match(page, /Array\.isArray\(item\.assignments\)/);
  assert.match(page, /Array\.isArray\(item\.serviceSelections\)/);
  assert.match(page, /selectedStaffTokens\.some\(\(identity\) => leadStaffTokens\.includes\(identity\)\)/);
});

test('actual creator and generated-for owner can both quote lead services', () => {
  const quotationPage = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
  assert.match(quotationPage, /lead\.generatedForUser\?\._id/);
  assert.match(quotationPage, /lead\.generatedForName/);
  assert.match(quotationPage, /participantTokens\.some\(\(token\) => userTokens\.includes\(token\)\)/);
});
