const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/clientController.js'), 'utf8');

test('remote Client Master search retains newly closed leads without an existing Client Master', () => {
  assert.match(page, /if \(Number\(item\.closedServiceCount\) > 0\) return true/);
  assert.match(page, /filterClientMasterSearchItems\(response\.data\.items \|\| \[\], \[\]\)/);
});

test('Client Master discovery includes staff assignments in access control', () => {
  assert.match(controller, /'assignments\.assignedStaffText'/);
  assert.match(controller, /'assignments\.assignedStaffEmail'/);
  assert.match(controller, /'assignments\.assignedStaff'/);
  assert.match(controller, /Lead\.find\(combineAccessFilters\(leadFilter, await leadAccessFilter\(req\.user\)\)\)/);
});
