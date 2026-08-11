const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Company Overview tab calculates progress from its configured overview fields', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  assert.match(page, /companyOverview:\s*countFields\(client, tabProgressFields\.companyOverview\)/);
  assert.match(page, /\['companyOverview', 'companyName'\]/);
  assert.match(page, /\['companyOverview', 'companySummary'\]/);
  assert.match(page, /\['companyOverview', 'productImage'\]/);
  assert.match(page, /const percent = summary\.total \? Math\.round\(\(summary\.filled \/ summary\.total\) \* 100\) : 0/);
});
