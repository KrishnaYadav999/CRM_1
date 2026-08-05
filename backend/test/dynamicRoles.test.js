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
