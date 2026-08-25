const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shellPath = path.resolve(__dirname, '../../frontend/src/components/dashboard/DashboardShell.jsx');

test('desktop sidebar allows collapsed navigation flyouts outside its rail', () => {
  const shell = fs.readFileSync(shellPath, 'utf8');

  assert.match(shell, /overflow-hidden[\s\S]*lg:overflow-visible/);
  assert.match(shell, /z-40/);
  assert.match(shell, /sidebarCollapsed \? 'lg:w-\[84px\]' : 'lg:w-\[296px\]'/);
  assert.match(shell, /sidebarCollapsed \? 'lg:ml-\[84px\]' : 'lg:ml-\[296px\]'/);
});
