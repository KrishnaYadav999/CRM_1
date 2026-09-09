const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Quotation = require('../src/models/Quotation');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Quotations.jsx'), 'utf8');
const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/quotationController.js'), 'utf8');

test('Quotation persists combined pricing groups with service membership and amount', () => {
  const groupPath = Quotation.schema.path('combinedPricingGroups');
  assert.ok(groupPath);
  const groupSchema = groupPath.schema;
  assert.ok(groupSchema.path('id'));
  assert.ok(groupSchema.path('name'));
  assert.ok(groupSchema.path('itemKeys'));
  assert.ok(groupSchema.path('basicAmount'));
});

test('Combined Pricing groups start with unassigned services and use row removal', () => {
  assert.match(page, /Add Combined Group/);
  assert.doesNotMatch(page, /> Add Services</);
  assert.doesNotMatch(page, /Select unassigned services/);
  assert.match(page, /current\.items\.map\(quotationItemKey\)/);
  assert.match(page, /createCombinedPricingGroup\(groups\.length, unassignedKeys\)/);
  assert.match(page, /Remove from this group/);
  assert.match(page, /Each group starts with all currently unassigned services/);
});

test('Combined group validation rejects empty, duplicate, and unassigned services', () => {
  assert.match(controller, /select at least one quotation service/);
  assert.match(controller, /cannot belong to more than one group/);
  assert.match(controller, /assign this service to a combined pricing group/);
  assert.match(page, /assign this service to a combined pricing group/);
});

test('Quotation preview, PDF view, and download merge amount cells per pricing group', () => {
  assert.match(page, /function combinedPricingRows/);
  assert.match(page, /rowSpan=\{combined \? groupSize : undefined\}/);
  assert.match(page, /rowspan="\$\{groupSize\}"/);
  assert.match(page, /combined \? group\.basicAmount : item\.basicAmount/);
});
