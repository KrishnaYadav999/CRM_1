const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sales MIS uses stable Created For ownership without manager assignment overwrite', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '../src/services/userProductivityReport.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx'), 'utf8');
  assert.match(service, /const generatedOwner = \[lead\.generatedForUser, lead\.generatedForName, lead\.generatedForEmail\]/);
  assert.match(service, /generatedOwner\.length \? generatedOwner/);
  assert.match(page, /const generatedOwner = \[lead\.generatedForUser, lead\.generatedForName, lead\.generatedForEmail\]/);
  assert.doesNotMatch(page, /const ownedLeads = leads\.filter\(\(lead\) => \[lead\.assignedTo/);
});
