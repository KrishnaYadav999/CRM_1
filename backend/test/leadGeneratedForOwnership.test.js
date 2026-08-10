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
  assert.match(page, /String\(generatedForOwnerId\)/);
});
