const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SupportTicket = require('../src/models/SupportTicket');
const { isAdmin } = require('../src/controllers/supportTicketController').__test;
const { SUPPORT_RECIPIENTS, buildRaisedEmail, buildResolvedEmail } = require('../src/services/supportTicketEmails');

test('support tickets are mounted behind CRM authentication', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/supportTickets.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(routes, /router\.get\('\/', requireAuth/);
  assert.match(routes, /router\.post\('\/', requireAuth/);
  assert.match(routes, /router\.put\('\/:id', requireAuth/);
  assert.match(app, /app\.use\('\/api\/support-tickets', supportTicketRoutes\)/);
});

test('only admin roles receive the all-ticket support view', () => {
  assert.equal(isAdmin({ role: 'admin' }), true);
  assert.equal(isAdmin({ role: 'superadmin' }), true);
  assert.equal(isAdmin({ role: 'sales' }), false);
});

test('ticket model accepts every requested CRM support category', () => {
  const allowed = SupportTicket.schema.path('category').enumValues;
  assert.deepEqual(allowed, ['Lead', 'Quotation', 'Client Master', 'Proforma Invoice']);
});

test('new-ticket email goes to both IT mailboxes with user and issue details', () => {
  assert.deepEqual(SUPPORT_RECIPIENTS, ['it_support@ananttattva.com', 'it_admin@ananttattva.com']);
  const email = buildRaisedEmail({ ticketNumber: 'TKT-2026-00001', createdByName: 'CRM User', createdByEmail: 'user@example.com', category: 'Lead', priority: 'High', subject: 'Unable to save', description: 'Save button returns an error.' });
  assert.match(email.subject, /TKT-2026-00001/);
  assert.match(email.html, /CRM User/);
  assert.match(email.html, /Save button returns an error/);
});

test('resolution email uses professional success wording', () => {
  const email = buildResolvedEmail({ ticketNumber: 'TKT-2026-00001', createdByName: 'CRM User', category: 'Lead', subject: 'Unable to save', status: 'Resolved' }, { name: 'IT Admin' }, 'Access has been restored.');
  assert.match(email.subject, /Successfully Resolved/);
  assert.match(email.html, /successfully resolved/i);
  assert.match(email.html, /Access has been restored/);
});

test('closed-ticket email uses status-specific success wording', () => {
  const email = buildResolvedEmail({ ticketNumber: 'TKT-2026-00002', createdByName: 'CRM User', category: 'Quotation', subject: 'Approval issue', status: 'Closed' }, { name: 'IT Admin' }, 'The approval workflow was corrected and verified.');
  assert.match(email.subject, /Successfully Closed/);
  assert.match(email.html, /successfully closed/i);
  assert.match(email.html, /workflow was corrected and verified/);
});
