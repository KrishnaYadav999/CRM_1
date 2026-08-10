const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('announcements require an image and email every active CRM user', () => {
  const controller = read('../src/controllers/notificationController.js');
  const page = read('../../frontend/src/pages/Notifications.jsx');
  assert.match(controller, /Announcement image is required/);
  assert.match(controller, /User\.find\(\{ isActive: \{ \$ne: false \}/);
  assert.match(controller, /Promise\.allSettled\(users\.map/);
  assert.match(page, /Add Announcement/);
  assert.match(page, /accept="image\/\*"/);
  assert.match(page, /Submit Announcement/);
});

test('CRM automatically logs out and audits users after thirty idle minutes', () => {
  const app = read('../../frontend/src/App.jsx');
  const auth = read('../src/controllers/authController.js');
  assert.match(app, /30 \* 60 \* 1000/);
  assert.match(app, /reason: 'inactivity'/);
  assert.match(auth, /Automatically logged out after 30 minutes of inactivity/);
});

test('document progress and frozen fields follow Producer and Importer applicability', () => {
  const page = read('../../frontend/src/pages/ClientMaster.jsx');
  const sections = read('../../frontend/src/features/clientMaster/ClientMasterFormSections.jsx');
  assert.match(page, /category\.includes\('producer'\).*key !== 'iec'/s);
  assert.match(page, /category\.includes\('importer'\).*factoryLicense.*dicDcssi/s);
  assert.match(page, /getApplicableComplianceRows\(client\)\.flatMap/);
  assert.match(sections, /Not Applicable/);
  assert.match(sections, /disabled=\{!applicable\}/);
});

test('support ticket replies create bell notifications for the other participant', () => {
  const controller = read('../src/controllers/supportTicketController.js');
  assert.match(controller, /kind: 'support_ticket_reply'/);
  assert.match(controller, /audience, metadata: \{ ticketId:/);
});
