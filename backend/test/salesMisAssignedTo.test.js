const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sales MIS live query and fallback both use Assigned To instead of Created By', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '../src/services/userProductivityReport.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx'), 'utf8');
  assert.match(service, /lead\.assignedTo, lead\.assignedToText, lead\.assignedToEmail/);
  assert.match(service, /select\('createdBy assignedTo assignedToText assignedToEmail generatedForUser generatedForName generatedForEmail/);
  assert.match(page, /lead\.assignedTo, lead\.assignedToText, lead\.assignedToEmail/);
  assert.doesNotMatch(page, /const ownedLeads = leads\.filter\(\(lead\) => \[lead\.createdBy/);
});
