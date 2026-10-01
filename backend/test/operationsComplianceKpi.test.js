const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx'), 'utf8');

test('operations compliance KPI counts converted Client Master rows instead of Leads', () => {
  assert.match(dashboard, /function buildComplianceKpi\(clientRows = \[\]/);
  assert.doesNotMatch(dashboard, /function buildComplianceKpi\(leads/);
  assert.match(dashboard, /getComplianceServiceKinds\(clientServiceSource\)\.forEach/);
});

test('operations compliance KPI keeps applicant types separate', () => {
  assert.match(dashboard, /COMPLIANCE_DEFAULT_APPLICANTS = \['Producer', 'Importer', 'Brand Owner', 'Recycler', 'SIMP', 'PWP'\]/);
  assert.doesNotMatch(dashboard, /label: 'Importer \/ PWP'/);
  assert.doesNotMatch(dashboard, /label: 'Recycler \/ SIMP'/);
  assert.match(dashboard, /wasteType === 'Plastic Waste'[\s\S]*source\.subApplicantType/);
  assert.match(dashboard, /source\.applicantType, source\.applicationType/);
});
