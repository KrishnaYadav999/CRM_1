const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shellPath = path.resolve(__dirname, '../../frontend/src/components/dashboard/DashboardShell.jsx');
const sidebarPath = path.resolve(__dirname, '../../frontend/src/components/dashboard/Sidebar.jsx');

test('desktop sidebar expands and shifts content instead of covering page controls', () => {
  const shell = fs.readFileSync(shellPath, 'utf8');
  const sidebar = fs.readFileSync(sidebarPath, 'utf8');

  assert.match(shell, /sidebarCollapsed \? 'lg:w-\[84px\]' : 'lg:w-\[296px\]'/);
  assert.match(shell, /sidebarCollapsed \? 'lg:ml-\[84px\]' : 'lg:ml-\[296px\]'/);
  assert.match(sidebar, /if \(collapsed\) \{[\s\S]*setOpenGroups\([\s\S]*onToggleCollapsed\?\.\(\)/);
  assert.doesNotMatch(sidebar, /if \(collapsed\) \{\s*setActiveFlyout\(\(value\)/);
});
