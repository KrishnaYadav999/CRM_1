const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterAnnualReturn.jsx'), 'utf8');

test('Annual Return hides Financials from the visible three-step processing flow', () => {
  const labelsBlock = source.match(/export const annualProcessingTabLabels = \{([\s\S]*?)\n\};/)?.[1] || '';
  const processingTabsBlock = source.match(/const processingTabs = \[([\s\S]*?)\n  \];/)?.[1] || '';
  assert.doesNotMatch(labelsBlock, /financials\s*:/);
  assert.doesNotMatch(processingTabsBlock, /id:\s*'financials'/);
  assert.match(processingTabsBlock, /id:\s*'basic'/);
  assert.match(processingTabsBlock, /id:\s*'data'/);
  assert.match(processingTabsBlock, /id:\s*'cpcbLetter'/);
});

test('Data exposes Portal Data and the Purchase Data Compliance workspace', () => {
  assert.match(source, /\{ id: 'portal', label: 'Portal Data' \}/);
  assert.match(source, /\{ id: 'compliance', label: 'Data Compliance' \}/);
  assert.match(source, /role="tablist" aria-label="Annual return data views"/);
  assert.match(source, /activeDataSubTab === 'portal'/);
  assert.match(source, /activeDataSubTab === 'compliance'/);
  assert.match(source, /<PurchaseDataWorkspace/);
  assert.match(source, /financialYear=\{selected\.label\}/);
});
