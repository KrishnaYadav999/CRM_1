const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('Client Master Basic Info provides and persists the Company Type dropdown', () => {
  const page = read('../../frontend/src/pages/ClientMaster.jsx');
  const constants = read('../../frontend/src/features/clientMaster/clientMaster.constants.js');
  const utils = read('../../frontend/src/features/clientMaster/clientMaster.utils.js');
  const report = read('../src/services/userProductivityReport.js');

  assert.match(constants, /companyType: \['Private Limited', 'LLP', 'Partnership', 'Proprietorship', 'Public Limited'\]/);
  assert.match(page, /SelectLike label="Company Type" value=\{basic\.companyType \?\? ''\} options=\{selectOptions\.companyType\} placeholder="Select Company Type"/);
  assert.match(page, /\['basic', 'companyType'\]/);
  assert.match(page, /\['Company Type', data\.basic\?\.companyType, Building2\]/);
  assert.match(utils, /companytype: 'basic\.companyType'/);
  assert.match(utils, /companyType: pickLookup\(lookup, \['Company Type', 'Company Constitution', 'Entity Type'\]\)/);
  assert.match(report, /\['companyType','Company Type'\]/);
});
