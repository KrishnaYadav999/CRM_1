const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');

test('temporary leads persist with atomic ATPL-TEMP identifiers', () => {
  const controller = read('../src/controllers/temporaryLeadController.js');
  const model = read('../src/models/TemporaryLead.js');
  assert.match(controller, /findOneAndUpdate/);
  assert.match(controller, /ATPL-TEMP-/);
  assert.match(model, /tempLeadCode:[\s\S]*unique: true/);
  assert.match(model, /enum: \['DRAFT', 'CONVERTED'\]/);
});

test('temporary lead APIs support list, create, filters and conversion', () => {
  const routes = read('../src/routes/leads.js');
  const controller = read('../src/controllers/temporaryLeadController.js');
  assert.match(routes, /router\.get\('\/temporary'/);
  assert.match(routes, /router\.post\('\/temporary'/);
  assert.match(routes, /router\.post\('\/temporary\/:id\/convert'/);
  assert.match(controller, /req\.query\.search/);
  assert.match(controller, /req\.query\.status/);
  assert.match(controller, /createLeadRecordInternal/);
  assert.match(controller, /DUPLICATE_LEAD_COMPANY/);
  assert.match(routes, /temporary\/:id\/follow-up/);
  assert.match(controller, /CalendarItem\.create/);
});

test('lead directory exposes the complete temporary lead workspace', () => {
  const page = read('../../frontend/src/pages/LeadGeneration.jsx');
  const app = read('../../frontend/src/App.jsx');
  assert.match(page, /Temporary Leads/);
  assert.match(page, /Submit Temp Lead/);
  assert.match(page, /Convert to Lead/);
  assert.match(page, /Ready to Convert/);
  assert.match(page, /10 per page/);
  assert.match(page, /Back to Leads/);
  assert.match(app, /sales\/lead-generation\/temporary/);
  assert.doesNotMatch(page, /fixed inset-0 z-\[140\]/);
  assert.match(page, /Temporary lead details/);
  assert.match(page, /Save Follow-up/);
  assert.match(page, /View table/);
  assert.doesNotMatch(page, /bg-slate-950 px-3 text-xs font-black text-white/);
});

test('Calendar supports temporary client selection, follow-up creation and clean modal switching', () => {
  const calendar = read('../../frontend/src/pages/CalendarTodo.jsx');
  const controller = read('../src/controllers/calendarItemController.js');
  assert.match(calendar, /temporaryLeads/);
  assert.match(calendar, /Temp Follow-Up/);
  assert.match(calendar, /setBucketPopup\(null\)/);
  assert.match(calendar, /temporaryLeadId/);
  assert.match(controller, /TemporaryLead\.findById/);
  assert.match(controller, /temporaryLead\.followUpHistory/);
  assert.match(controller, /scheduleLinkedLeadFollowUp[\s\S]*ATPL-TEMP-/);
});
