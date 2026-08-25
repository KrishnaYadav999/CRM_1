const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('100-ticket milestone uses a versioned, authenticated, atomic backend claim', () => {
  const controller = read('backend/src/controllers/authController.js');
  const routes = read('backend/src/routes/auth.js');
  const userModel = read('backend/src/models/User.js');

  assert.match(controller, /support_tickets_100_v1/);
  assert.match(controller, /SupportTicket\.countDocuments\(\{\}\)/);
  assert.match(controller, /milestoneAcknowledgements\.key[^\n]+\$ne/);
  assert.match(controller, /modifiedCount === 1/);
  assert.match(routes, /post\('\/milestones\/:key\/claim', requireAuth, authCtrl\.claimMilestone\)/);
  assert.match(userModel, /milestoneAcknowledgements/);
  assert.match(userModel, /seenAt/);
});

test('celebration is global, responsive, reduced-motion aware, and cleans animation resources', () => {
  const app = read('frontend/src/App.jsx');
  const component = read('frontend/src/components/SupportTicketMilestoneCelebration.jsx');
  const styles = read('frontend/src/styles/modules/16-support-milestone.css');

  assert.match(app, /<SupportTicketMilestoneCelebration \/>/);
  assert.match(component, /DURATION_MS = 15000/);
  assert.match(component, /cancelAnimationFrame/);
  assert.match(component, /removeEventListener\('resize'/);
  assert.match(component, /useReducedMotion/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(styles, /position:fixed;inset:0/);
  assert.match(styles, /pointer-events:none/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
