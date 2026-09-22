const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('frontend appends the required API prefix to configured backend URLs', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/api.js'), 'utf8');
  assert.match(source, /if \(configured === '\/api' \|\| \/\\\/api\$\/i\.test\(configured\)\) return configured/);
  assert.match(source, /return `\$\{configured\}\/api`/);
});

test('production frontend always uses the same-origin Vercel API proxy', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/api.js'), 'utf8');
  assert.match(source, /const configuredBaseURL = import\.meta\.env\.DEV/);
  assert.match(source, /\? \(import\.meta\.env\.VITE_CRM_API_URL \|\| import\.meta\.env\.VITE_API_URL\)/);
  assert.match(source, /: ''/);
});

test('Vercel API proxy targets the active Render backend', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/vercel.json'), 'utf8'));
  const apiRoute = config.routes.find((route) => route.src === '/api/(.*)');

  assert.equal(apiRoute?.dest, 'https://crm-1-am0y.onrender.com/api/$1');
});
