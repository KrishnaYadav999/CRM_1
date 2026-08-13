const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '../../frontend/src');

test('populated CRM user objects are converted to labels before React renders them', () => {
  const pendingApproval = fs.readFileSync(path.join(frontendRoot, 'pages/PendingApproval.jsx'), 'utf8');
  const leadGeneration = fs.readFileSync(path.join(frontendRoot, 'pages/LeadGeneration.jsx'), 'utf8');

  assert.match(pendingApproval, /formatApprovalValue\(client\.createdBy\)/);
  assert.match(pendingApproval, /formatApprovalValue\(quote\.createdBy\)/);
  assert.match(leadGeneration, /function personLabel\(value, fallback = '-'\)/);
  assert.match(leadGeneration, /personLabel\(item\.assignedBy/);
  assert.match(leadGeneration, /personLabel\(row\.assignedBy \|\| activeLead\.assignedBy\)/);
});
