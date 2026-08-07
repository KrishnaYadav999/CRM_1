const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SupportTicket = require('../src/models/SupportTicket');
const { isAdmin, cleanAttachments } = require('../src/controllers/supportTicketController').__test;
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

test('ticket image attachments keep only valid secure image uploads', () => {
  const attachments = cleanAttachments([
    { name: 'error.png', secureUrl: 'https://res.cloudinary.com/demo/image/upload/error.png', type: 'image/png', size: 1200 },
    { name: 'unsafe.png', url: 'javascript:alert(1)', type: 'image/png' },
    { name: 'document.pdf', url: 'https://example.com/file.pdf', type: 'application/pdf' }
  ]);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].name, 'error.png');
});

test('ticket creation requires at least one valid issue screenshot', () => {
  assert.equal(cleanAttachments([]).length, 0);
  assert.equal(cleanAttachments([{ url: 'javascript:alert(1)', type: 'image/png' }]).length, 0);
  assert.equal(cleanAttachments([{ url: 'https://example.com/error.webp', type: 'image/webp' }]).length, 1);
});

test('ticket screenshots render inside the conversation at a compact size', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/SupportTickets.jsx'), 'utf8');
  assert.match(page, /document\.querySelector\('aside > div\.flex-1\.overflow-y-auto'\)/);
  assert.match(page, /max-w-md/);
  assert.match(page, /h-20 w-full object-cover/);
  assert.doesNotMatch(page, /fixed bottom-24 right-5/);
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
