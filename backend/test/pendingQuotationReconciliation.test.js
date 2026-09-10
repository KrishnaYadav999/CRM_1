const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerSource = fs.readFileSync(path.join(__dirname, '../src/controllers/clientController.js'), 'utf8');

test('pending approval endpoint recovers quotations missing from the approval index', () => {
  assert.match(controllerSource, /Quotation\.find\(\{ status: \{ \$in: \['draft', 'submitted', 'sent'\] \} \}\)/);
  assert.match(controllerSource, /const missingQuotationRows = liveQuotationRows\.filter/);
  assert.match(controllerSource, /backgroundSyncPendingApprovals\(\[\], missingQuotationRows\)/);
  assert.match(controllerSource, /pendingQuotations: isAdministrativeReviewer \? responseQuotations : \[\]/);
});
