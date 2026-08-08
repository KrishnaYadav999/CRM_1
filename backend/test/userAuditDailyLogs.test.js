const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardPath = path.resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx');
const authControllerPath = path.resolve(__dirname, '../src/controllers/authController.js');

test('user audit logs aggregate sessions into India-timezone daily rows', () => {
  const page = fs.readFileSync(dashboardPath, 'utf8');
  const controller = fs.readFileSync(authControllerPath, 'utf8');
  assert.match(page, /function buildDailyLogRows\(sessionRows = \[\]\)/);
  assert.match(page, /timeZone: 'Asia\/Kolkata'/);
  assert.match(page, /sessionCount \+= 1/);
  assert.match(page, /existing\.activeSeconds \+=/);
  assert.match(page, /existing\.awaySeconds \+=/);
  assert.match(controller, /T00:00:00\.000\+05:30/);
  assert.match(controller, /T23:59:59\.999\+05:30/);
});

test('daily audit table and Excel expose date, online window, offline time, and durations', () => {
  const page = fs.readFileSync(dashboardPath, 'utf8');
  assert.match(page, /'Online From - Offline At','Online Duration','Away Duration','Total Duration'/);
  assert.match(page, /formatAuditTime\(row\.firstLoginAt\).*formatAuditTime\(row\.offlineAt\)/s);
  assert.match(page, /'Offline \/ Last Seen'/);
  assert.match(page, /'Online Window'/);
  assert.match(page, /'Daily User Summary'/);
  assert.match(page, /'Login Sessions'/);
});
