const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '../../frontend/src');

test('Client Master consent year choices extend through 2040', () => {
  const constants = fs.readFileSync(path.join(frontendRoot, 'features/clientMaster/clientMaster.constants.js'), 'utf8');
  assert.match(constants, /years:\s*Array\.from\(\{\s*length:\s*26\s*\},\s*\(_?,?\s*index\)\s*=>\s*String\(2040\s*-\s*index\)\)/);
});

test('updating a follow-up closes the prior item and keeps closed history visible', () => {
  const page = fs.readFileSync(path.join(frontendRoot, 'pages/LeadGeneration.jsx'), 'utf8');
  assert.match(page, /status:\s*'closed'/);
  assert.match(page, /closedAt:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(page, /followUpHistory:\s*\[\.\.\.previousCurrent,\s*\.\.\.\(Array\.isArray\(service\.followUpHistory\)/);
  assert.match(page, /item\.status === 'closed' \? 'Follow up closed' : item\.reason/);
  assert.match(page, /\.filter\(\(item\) => !item\.isCurrent \|\| !item\.scheduledDate \|\| item\.scheduledDate < todayKey\)/);
});

test('follow-up edit can explicitly close the reminder workflow', () => {
  const page = fs.readFileSync(path.join(frontendRoot, 'pages/LeadGeneration.jsx'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  const reminders = fs.readFileSync(path.resolve(__dirname, '../src/services/leadWorkflowReminders.js'), 'utf8');
  assert.match(page, />Follow-Up Close<\/button>/);
  assert.match(page, /async function closeFollowUp\(\)/);
  assert.match(page, /nextFollowUpDate:\s*''/);
  assert.match(page, /followUpClosedAt:\s*closedAt/);
  assert.match(page, /followUpCloseReason:\s*closedEntry\.reason/);
  assert.match(page, /followUpClosedAt:\s*''/);
  assert.match(controller, /followUpClosedAt:\s*String\(row\?\.followUpClosedAt/);
  assert.match(reminders, /!service\.followUpClosedAt/);
});
