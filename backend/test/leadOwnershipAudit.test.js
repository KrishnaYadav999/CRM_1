const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lead allocation preserves creator and updates only stable lead owner', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const allocation = controller.slice(controller.indexOf('exports.allocateLead'), controller.indexOf('exports.updateLead'));
  assert.match(allocation, /lead\.generatedForUser = target\._id/);
  assert.doesNotMatch(allocation, /lead\.createdBy = target\._id/);
});

test('create and close behalf identities are persisted and displayed separately', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const model = fs.readFileSync(path.resolve(__dirname, '../src/models/Lead.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');
  assert.match(model, /createdOnBehalfOfUser/);
  assert.match(model, /closedOnBehalfOfUser/);
  assert.match(page, /Created For \/ Behalf Of/);
  assert.match(page, /Closed On Behalf Of/);
  assert.match(page, /function primaryLeadOwner/);
  assert.match(page, /Primary Lead Owner/);
  assert.match(page, /behalfMode: 'lead-owner'/);
  assert.match(controller, /function enforcePrimaryOwnerClosureCredit/);
  assert.match(controller, /data = enforcePrimaryOwnerClosureCredit\(beforeLead, data, req\.user\)/);
  assert.match(controller, /closureRequestedBy: actorId/);
});
