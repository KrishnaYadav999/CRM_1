const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LeadDropdownOption = require('../src/models/LeadDropdownOption');

test('lead dropdown catalog exposes all configurable business fields', () => {
  assert.deepEqual(LeadDropdownOption.ALLOWED_FIELDS, [
    'communicationMode', 'status', 'industryType', 'applicantType', 'financialYear',
    'state', 'city', 'salutation', 'designation', 'source', 'businessCategory', 'eprCategory'
  ]);
});

test('new lead dropdown values require admin roles while reads require authentication', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/leads.js'), 'utf8');
  assert.match(routes, /router\.get\('\/dropdown-options', requireAuth/);
  assert.match(routes, /router\.post\('\/dropdown-options', requireAuth, requireRoles\(ADMIN_ROLES\)/);
});
