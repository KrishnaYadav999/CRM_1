const test = require('node:test');
const assert = require('node:assert/strict');
const { overallPipeline, overallRecordsFromLeads, loadOverallRecords, createOverallCache } = require('../src/services/overallDashboardData');
const { buildOverall } = require('../src/services/overallDashboard');

test('analytics queries only projected Leads and limits database execution time', async () => {
  const filter = { createdBy: 'owner' };
  let actualPipeline, actualOptions;
  const Lead = { aggregate(pipeline) { actualPipeline = pipeline; return { option(options) { actualOptions = options; return Promise.resolve([]); } }; } };
  assert.deepEqual(await loadOverallRecords(Lead, filter), []);
  assert.deepEqual(actualPipeline[0], { $match: filter });
  assert.deepEqual(actualOptions, { maxTimeMS: 12000 });
  const projection = overallPipeline()[1].$project;
  assert.equal(projection.data, undefined);
  assert.equal(projection.assignments.$map.in.poYearRows.$map.in.poFileUrl, undefined);
  assert.ok(projection.assignments.$map.in.poYearRows.$map.in.hasPoEvidence);
});
test('compact records preserve closure, service fallback, FY deduplication and proof-only POs', () => {
  const records = overallRecordsFromLeads([{ _id: 'lead', company: 'CCL', applicantType: 'PIBO', serviceSelections: [
    { subApplicantType: 'Producer', servicesOffered: 'New Registration' },
    { subApplicantType: 'Producer', servicesOffered: 'Consulting' },
    { subApplicantType: 'Producer', servicesOffered: 'Account Closure' }
  ], assignments: [
    { closedAt: '2026-10-01', poYearRows: [{ fy: '2026-27', hasPoEvidence: true, services: [] }, { fy: '2026-27', hasPoEvidence: true, services: ['New Registration'] }] },
    { closedByText: 'Manager', poYearRows: [{ fy: '2026-27', hasPoEvidence: true, services: [{ name: 'Consulting' }] }, { fy: '2027-28', hasPoEvidence: false, services: ['Consulting'] }] },
    { poYearRows: [{ fy: '2026-27', hasPoEvidence: true, services: ['Account Closure'] }] }
  ] }]);
  assert.equal(records.length, 3);
  const data = buildOverall(records);
  assert.equal(data.summary.clients, 1);
  assert.equal(data.summary.services, 2);
  const producer = data.groups.find((group) => group.type === 'Producer');
  assert.equal(producer.services['New Registration'], 1);
  assert.equal(producer.services['Account Closure'], undefined);
  assert.deepEqual(data.yearOptions, ['2025-26', '2026-27']);
});
test('cache coalesces concurrent refreshes and isolates user scopes', async () => {
  const cached = createOverallCache();
  let loads = 0;
  const loader = async () => { loads++; return ['data']; };
  const results = await Promise.all([cached('user-one', loader), cached('user-one', loader)]);
  assert.equal(loads, 1);
  assert.deepEqual(results[0], results[1]);
  await cached('user-two', loader);
  assert.equal(loads, 2);
});
test('cache expires and never retains a failed request', async () => {
  let clock = 0, loads = 0;
  const cached = createOverallCache({ ttl: 30, now: () => clock });
  const loader = async () => { loads++; return []; };
  await cached('scope', loader);
  clock = 31;
  await cached('scope', loader);
  assert.equal(loads, 2);
  await assert.rejects(cached('failure', async () => { throw new Error('timeout'); }), /timeout/);
  assert.deepEqual(await cached('failure', loader), []);
});
