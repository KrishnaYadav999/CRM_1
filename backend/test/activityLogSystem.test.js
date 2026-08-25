const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getChangedFields, sanitizeMetadata, parseUserAgent } = require('../src/services/activityLogService');

test('field audit stores only real, non-sensitive changes', () => {
  const changes = getChangedFields({ status: 'New', amount: 10, password: 'old' }, { status: 'Interested', amount: 10, password: 'new' });
  assert.deepEqual(changes, [{ field: 'status', oldValue: 'New', newValue: 'Interested' }]);
  assert.deepEqual(sanitizeMetadata({ remark: 'Call back', accessToken: 'secret' }), { remark: 'Call back' });
});

test('device parser exposes useful browser context without raw credentials', () => {
  assert.deepEqual(parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0'), { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', browser: 'Chrome', device: 'Desktop' });
});

test('admin activity route provides server filters, pagination, KPI and details UI', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/activityLogController.js'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ActivityLogs.jsx'), 'utf8');
  assert.match(controller, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(controller, /activeUsersToday/);
  assert.match(controller, /requestedUser/);
  assert.match(controller, /\[10, 25, 50, 100\]/);
  assert.match(page, /Activity Logs & Audit Trail/);
  assert.match(page, /Support Tickets Raised|Tickets Raised/);
  assert.match(page, /ChevronLeft/);
  assert.match(page, /paginationPages/);
  assert.doesNotMatch(page, /'CRM User'/);
  assert.match(page, /Changes/);
});
