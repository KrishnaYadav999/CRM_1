const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('lead details exposes the original-PO permanent closure flow only for provisional assignments', () => {
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');
  assert.match(page, /row\?\.poStatus === 'provisional'/);
  assert.match(page, /Original PO Received\?/);
  assert.match(page, /Have you received the original Purchase Order\?/);
  assert.match(page, /Permanently Close Lead/);
  assert.match(page, /API_ENDPOINTS\.leads\.permanentClosure/);
  assert.match(page, /originalPoReceived: true/);
  assert.match(page, /Lead ID/);
  assert.match(page, /Service &amp; Applicant/);
});

test('permanent closure has a dedicated authenticated endpoint and audit trail', () => {
  const routes = read('../src/routes/leads.js');
  const controller = read('../src/controllers/leadController.js');
  assert.match(routes, /\/:id\/permanent-closure.*requireAuth.*permanentlyCloseProvisionalLead/);
  assert.match(controller, /exports\.permanentlyCloseProvisionalLead/);
  assert.match(controller, /req\.body\?\.originalPoReceived !== true/);
  assert.match(controller, /permanentlyCloseProvisionalAssignments/);
  assert.match(controller, /Permanent closure is server-only/);
  assert.match(controller, /lead_permanently_closed/);
  assert.match(controller, /Automatic reopening is disabled/);
});
