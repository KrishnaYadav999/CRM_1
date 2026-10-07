const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultChecklist, excelUploadComplete } = require('../src/services/purchaseDataService');

test('new explanation stages preserve existing rows and saved status', () => {
  const rows = defaultChecklist([{ particular: 'Data Explained', yesNo: 'Yes' }, { particular: 'Upload Complete', yesNo: 'Yes' }]);
  assert.equal(rows.find(row => row.particular === 'Data Explained').yesNo, 'Yes');
  assert.equal(rows.find(row => row.particular === 'Data Format Sent').yesNo, '');
  assert.equal(rows.at(-1).particular, 'Upload Complete');
});

test('upload notification requires completion and both imported Excel files', () => {
  const data = { checklist: [{ particular: 'Upload Complete', yesNo: 'Yes' }], baseUpload: { importStatus: 'Imported' }, portalUpload: { importStatus: 'Imported' } };
  assert.equal(excelUploadComplete(data), true);
  assert.equal(excelUploadComplete({ ...data, baseUpload: null }), false);
  assert.equal(excelUploadComplete({ ...data, portalUpload: { importStatus: 'Failed' } }), false);
  assert.equal(excelUploadComplete({ ...data, checklist: [{ particular: 'Upload Complete', yesNo: 'No' }] }), false);
  assert.equal(excelUploadComplete({ ...data, checklist: [] }), false);
});
