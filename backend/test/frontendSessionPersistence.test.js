const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const apiSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/api.js'), 'utf8');

test('an integration 401 does not clear the CRM browser session', () => {
  assert.doesNotMatch(apiSource, /if\s*\(error\?\.response\?\.status\s*===\s*401\)\s*\{\s*clearStoredSession\(\)/);
  assert.match(apiSource, /isSessionValidationRequest\s*\|\|\s*isActualCrmSessionFailure/);
  assert.match(apiSource, /invalid or expired token/);
  assert.match(apiSource, /user is not active/);
});
