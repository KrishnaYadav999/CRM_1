const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const proxy = require('../src/routes/ccpIntegrations');

const { sanitizeLead, sanitizeClient } = proxy._test;
const user = { _id: '64b000000000000000000001', name: 'CRM User', email: 'User@Example.com', role: 'sales' };

test('lead payload is whitelisted and creator identity is server-owned', () => {
  const payload = sanitizeLead({ company: 'Acme', workflowStatus: 'submitted', createdByEmail: 'spoof@example.com', unexpected: true }, user);
  assert.equal(payload.company, 'Acme');
  assert.equal(payload.createdByEmail, 'user@example.com');
  assert.equal(payload.createdByCrmUserId, String(user._id));
  assert.equal(payload.unexpected, undefined);
});

test('CRM ids are not forwarded as CCP assignedTo ids', () => {
  const payload = sanitizeLead({ assignedTo: 'crm-user-id', assignedToCrmUserId: 'crm-user-id', assignedToEmail: 'staff@example.com' }, user);
  assert.equal(payload.assignedTo, undefined);
  assert.equal(payload.assignedToCrmUserId, 'crm-user-id');
});

test('blank closedBy is not forwarded as a CCP ObjectId', () => {
  const payload = sanitizeLead({ company: 'Acme', closedBy: '', closedByText: 'CRM User', closedByEmail: 'closer@example.com' }, user);
  assert.equal(payload.closedBy, undefined);
  assert.equal(payload.closedByText, 'CRM User');
  assert.equal(payload.closedByEmail, 'closer@example.com');
});

test('lead update does not send CRM user names as CCP updatedBy ObjectIds', () => {
  const payload = sanitizeLead({ company: 'Acme', updatedBy: 'CRM User' }, user, { isUpdate: true });
  assert.equal(payload.updatedBy, undefined);
  assert.equal(payload.updatedByText, 'CRM User');
  assert.equal(payload.updatedByEmail, 'user@example.com');
  assert.equal(payload.updatedByCrmUserId, String(user._id));
});

test('client payload remains nested and non-admin cannot spoof approval', () => {
  const payload = sanitizeClient({ selectedLead: '64b000000000000000000099', workflowStatus: 'submitted', adminControls: { approvalStatus: 'APPROVED' }, data: { basic: { clientLegalName: 'Acme', evil: true }, registeredAddress: { address1: 'One' } } }, user, false);
  assert.equal(payload.data.basic.clientLegalName, 'Acme');
  assert.equal(payload.data.basic.evil, undefined);
  assert.equal(payload.adminControls.approvalStatus, 'PENDING');
  assert.equal(payload.createdByEmail, 'user@example.com');
});

test('client payload forwards named process diagram PDFs to CCP', () => {
  const payload = sanitizeClient({
    data: {
      processDiagrams: [
        { id: 'pfd-1', name: 'Process Flow Diagram', file: { url: 'https://cdn.example.com/pfd.pdf' }, ignored: true }
      ]
    }
  }, user, true);
  assert.deepEqual(payload.data.processDiagrams, [
    { id: 'pfd-1', name: 'Process Flow Diagram', file: { url: 'https://cdn.example.com/pfd.pdf' } }
  ]);
});

test('frontend never contains the CCP shared API key', () => {
  const frontend = path.join(__dirname, '../../frontend/src');
  const files = [];
  function walk(dir) { fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : files.push(path.join(dir, entry.name))); }
  walk(frontend);
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /CCP_SHARED_API_KEY|x-ccp-api-key/i);
});

test('proxy module has no CRM Lead or Client persistence dependency', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/ccpIntegrations.js'), 'utf8');
  assert.doesNotMatch(source, /models\/(Lead|Client)|\.create\(|insertMany|findOneAndUpdate|updateOne/);
  assert.match(source, /ccpApiUrl\(`ccp\/\$\{resource\}`\)/);
});
