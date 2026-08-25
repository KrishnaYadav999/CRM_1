const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Annual Return hubs open only for PO received years', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientMasterAnnualReturn.jsx'), 'utf8');
  assert.match(source, /poState\.poStatus !== 'received'/);
  assert.match(source, /poState\.poStatus === 'received'.*Open Annual Return/);
  assert.match(source, /poState\.poStatus === 'not_required'.*bg-red-600.*Open Annual Return/);
});

test('OTP identity is hidden from the directory table and shown after eye view', () => {
  const directory = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/features/clientMaster/ClientDirectoryView.jsx'), 'utf8');
  const detail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  const tableHeader = directory.match(/\{\['Unique ID'[\s\S]*?\.map\(\(header\)/)?.[0] || '';
  assert.doesNotMatch(tableHeader, /OTP Mobile|OTP Name/);
  assert.match(detail, /InlineClientMeta label="OTP Mobile"/);
  assert.match(detail, /InlineClientMeta label="OTP Name"/);
});
