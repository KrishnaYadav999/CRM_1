const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('submitted populated Client Master wins over a newer empty draft', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');

  assert.match(controller, /sort\(\{ workflowStatus: -1, updatedAt: -1 \}\)/);
  assert.match(page, /service\.workflowStatus[\s\S]*=== 'submitted' \? 10000 : 0/);
  assert.match(page, /lead\?\._clientMasterServices[\s\S]*\.sort\(\(left, right\) =>/);
  assert.match(page, /right\.workflowStatus[\s\S]*=== 'submitted'/);
  assert.match(page, /if \(storedIndex < 0 && groupingIdentity\)[\s\S]*clientMasterGroupingIdentity\(stored\) === groupingIdentity/);
  assert.match(page, /if \(storedIndex < 0 && assignedServiceId\)/);
  assert.match(page, /groupedLeadServices\.length === 1[\s\S]*workflowStatus[\s\S]*=== 'submitted'/);
  assert.match(controller, /function clientMasterGroupCountForLead/);
  assert.match(controller, /clientMasterCount: item\.serviceGroupCount \|\| item\.clientMasterIds\.size/);
});
