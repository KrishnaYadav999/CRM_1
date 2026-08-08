const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/services/leadWorkflowReminders');

test('follow-up escalation uses the production 30m, 60m, 24h and 48h timeline', () => {
  const due = Date.parse('2026-08-05T10:00:00Z');
  assert.equal(__test.followUpEscalationStage(due, due - (30 * 60 * 1000)), 'DUE_IN_30M');
  assert.equal(__test.followUpEscalationStage(due, due + (30 * 60 * 1000)), 'OVERDUE_30M');
  assert.equal(__test.followUpEscalationStage(due, due + (60 * 60 * 1000)), 'OVERDUE_60M');
  assert.equal(__test.followUpEscalationStage(due, due + (24 * 60 * 60 * 1000)), 'RED_FLAG_24H');
  assert.equal(__test.followUpEscalationStage(due, due + (48 * 60 * 60 * 1000)), 'PERMANENT_RED_48H');
});

test('lead summary runs only on the last day of each India-timezone month', () => {
  assert.equal(__test.indiaMonthEndKey(Date.parse('2026-08-30T18:30:00Z')), '2026-08');
  assert.equal(__test.indiaMonthEndKey(Date.parse('2026-08-29T18:30:00Z')), '');
  assert.equal(__test.indiaMonthEndKey(Date.parse('2028-02-28T18:30:00Z')), '2028-02');
});

test('month-end lead email contains separate open and closed counts', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/leadWorkflowReminders.js'), 'utf8');
  assert.match(source, /kind:\s*'month_end_lead_summary'/);
  assert.match(source, /openLeadCount:\s*openRows\.length/);
  assert.match(source, /closedLeadCount:\s*closedRows\.length/);
  assert.match(source, /Open Leads/);
  assert.match(source, /Closed Leads/);
});

test('getCcpLeads returns an empty list when the CCP endpoint is unreachable', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  try {
    const leads = await __test.getCcpLeads();
    assert.deepEqual(leads, []);
  } finally {
    global.fetch = originalFetch;
  }
});
