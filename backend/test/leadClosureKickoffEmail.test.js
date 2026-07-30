const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isKickoffReady,
  kickoffRecipients
} = require('../src/services/leadClosureKickoffEmail');

const contact = { emails: 'Client@Example.com' };
const closedAssignment = {
  closedByText: 'Closer',
  assignedToText: 'Manager',
  assignedToEmail: 'manager@example.com'
};

test('kick-off becomes ready when staff is assigned after the lead was closed', () => {
  const before = { contacts: [contact], assignments: [closedAssignment] };
  const after = {
    contacts: [contact],
    assignments: [{ ...closedAssignment, assignedStaffText: 'Staff', assignedStaffEmail: 'staff@example.com' }]
  };

  assert.equal(isKickoffReady(before), false);
  assert.equal(isKickoffReady(after), true);
});

test('kick-off requires a contact recipient and a complete assignment', () => {
  assert.equal(isKickoffReady({
    assignments: [{ ...closedAssignment, assignedStaffText: 'Staff' }]
  }), false);
  assert.equal(isKickoffReady({
    contacts: [contact],
    assignments: [{ ...closedAssignment, assignedStaffText: 'Staff' }]
  }), true);
});

test('contact recipients are normalized and deduplicated', () => {
  assert.deepEqual(kickoffRecipients({
    contacts: [{ emails: 'Client@Example.com; second@example.com' }],
    emails: 'client@example.com'
  }), ['client@example.com', 'second@example.com']);
});
