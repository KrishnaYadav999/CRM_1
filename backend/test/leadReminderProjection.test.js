const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('minute reminder scan reads ownership, closure and follow-up fields without proof documents', async () => {
  let selected = ''; let timeout = 0;
  const context = { module: { exports: {} }, console, require(name) {
    if (name === '../models/Lead') return { find(filter) { assert.deepEqual(Object.keys(filter), []); return {
      select(value) { selected = value; return this; }, maxTimeMS(value) { timeout = value; return this; }, lean: async () => []
    }; } };
    if (name === '../constants/roles') return { ADMIN_ROLES: ['admin', 'superadmin'] };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/leadWorkflowReminders.js'), 'utf8'), context);
  await context.module.exports.__test.getCcpLeads();
  const fields = selected.split(' ');
  for (const field of ['company', 'bulkImported', 'createdByCrmUserId', 'nextFollowUpDate', 'closedAt', 'serviceSelections.nextFollowUpDate', 'serviceSelections.followUpClosedAt', 'serviceSelections.createdByEmail', 'assignments.assignedTo', 'assignments.closedAt']) assert.ok(fields.includes(field), field);
  assert.ok(!fields.some((field) => /file|proof|url|poYearRows/i.test(field)));
  assert.equal(timeout, 15000);
});
