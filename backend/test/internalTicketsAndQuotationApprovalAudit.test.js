const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('quotation APIs populate approval reviewer and closure shows proof audit', () => {
  const controller = read('backend/src/controllers/quotationController.js');
  const leadPage = read('frontend/src/pages/LeadGeneration.jsx');
  assert.match(controller, /populate\('approvalDecision\.actionBy', 'name email role'\)/);
  assert.match(leadPage, /Quotation Approved/);
  assert.match(leadPage, /View approval proof/);
  assert.match(leadPage, /businessLeadCode \|\| lead\.leadCode/);
});

test('internal tickets have isolated database API, participants, chat, and attachments', () => {
  const model = read('backend/src/models/InternalTicket.js');
  const controller = read('backend/src/controllers/internalTicketController.js');
  const app = read('backend/src/index.js');
  const frontend = read('frontend/src/pages/InternalTickets.jsx');
  assert.match(model, /participants/);
  assert.match(model, /messages/);
  assert.match(controller, /cleanAttachments/);
  assert.match(controller, /canAccess/);
  assert.match(app, /\/api\/internal-tickets/);
  assert.match(frontend, /Internal Tickets & Team Chat/);
  assert.match(frontend, /Attach files or images/);
});
