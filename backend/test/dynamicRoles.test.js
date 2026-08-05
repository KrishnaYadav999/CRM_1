const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('role catalog is readable by authenticated users and writable only by admins', () => {
  const routes = read('src/routes/auth.js');
  assert.match(routes, /router\.get\('\/roles', requireAuth, authCtrl\.listRoles\)/);
  assert.match(routes, /router\.post\('\/roles', requireAuth, requireRoles\(ADMIN_ROLES\), authCtrl\.createRole\)/);
});

test('user schema accepts database-backed custom roles', () => {
  const schema = read('src/models/User.js');
  assert.doesNotMatch(schema, /role:\s*\{[^}]*enum:\s*ROLES/);
  assert.match(schema, /role:\s*\{[^}]*default:\s*'operation'/);
});

test('a custom label can coexist with a legacy key that has a different display label', () => {
  const controller = read('src/controllers/authController.js');
  assert.match(controller, /matchesSystemLabel/);
  assert.match(controller, /if \(!ROLES\.includes\(requestedName\)\) duplicateConditions\.push\(\{ name: requestedName \}\)/);
  assert.match(controller, /ROLES\.includes\(requestedName\) \? `custom-\$\{requestedName\}` : requestedName/);
});
