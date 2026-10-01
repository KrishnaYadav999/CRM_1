const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx'), 'utf8');

test('operations compliance KPI counts converted Client Master rows instead of Leads', () => {
  assert.match(dashboard, /function buildComplianceKpi\(clientRows = \[\]/);
  assert.doesNotMatch(dashboard, /function buildComplianceKpi\(leads/);
  assert.match(dashboard, /const clientKinds = getComplianceServiceKinds\(clientServiceSource\)/);
  assert.match(dashboard, /Array\.isArray\(client\.services\)/);
  assert.doesNotMatch(dashboard, /mergeClientSources\(crmClients, \[\]\)/);
  assert.match(dashboard, /if \(recordId\) return `record:/);
  assert.match(dashboard, /linkedLead\.serviceSelections/);
});

test('operations compliance KPI keeps applicant types separate', () => {
  assert.match(dashboard, /COMPLIANCE_DEFAULT_APPLICANTS = \['Producer', 'Importer', 'Brand Owner', 'Recycler', 'SIMP', 'PWP'\]/);
  assert.doesNotMatch(dashboard, /label: 'Importer \/ PWP'/);
  assert.doesNotMatch(dashboard, /label: 'Recycler \/ SIMP'/);
  assert.match(dashboard, /wasteType === 'Plastic Waste'[\s\S]*source\.subApplicantType/);
  assert.match(dashboard, /source\.applicantType, source\.applicationType/);
});
