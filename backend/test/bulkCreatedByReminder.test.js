const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('bulk pending reminders prioritize Excel Created By while manual reminders keep assignment priority', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/leadWorkflowReminders.js'), 'utf8');
  assert.match(source, /const assignment = lead\.bulkImported\s*\? \{\}/);
  assert.match(source, /lead\.createdByCrmUserId \|\| creatorRow\.createdByCrmUserId/);
});
