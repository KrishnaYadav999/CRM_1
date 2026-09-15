const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('frontend uses one DD-MM-YYYY display formatter without changing ISO input storage', () => {
  const formatter = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/dateFormat.js'), 'utf8');
  const complianceReview = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientComplianceReview.jsx'), 'utf8');
  const datePicker = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/form/PremiumDatePicker.jsx'), 'utf8');
  assert.match(formatter, /return `\$\{iso\[3\]\}-\$\{iso\[2\]\}-\$\{iso\[1\]\}`/);
  assert.match(complianceReview, /if \(\/date\/i\.test\(key\).*formatDisplayDate\(value\)/);
  assert.match(datePicker, /DD-MM-YYYY/);
  assert.match(datePicker, /return `\$\{year\}-\$\{month\}-\$\{day\}`/);
});
