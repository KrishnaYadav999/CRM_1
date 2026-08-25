const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Client Master rows group by applicant, sub-applicant and plant unit', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');

  assert.match(source, /function clientMasterGroupingIdentity/);
  assert.match(source, /service\.applicantType \|\| service\.piboParent \|\| service\.piboCategoryParent/);
  assert.match(source, /service\.subApplicantType \|\| service\.piboCategory \|\| 'not-applicable'/);
  assert.match(source, /const plantUnit = normalize\(service\.plantUnit\)/);
  assert.match(source, /client-master-group:\$\{groupingIdentity\}/);
  assert.match(source, /clientMasterGroupingIdentity\(stored\) === clientMasterGroupingIdentity\(currentService\)/);
});
