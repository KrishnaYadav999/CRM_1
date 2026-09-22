const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const { cleanClientLifecycle } = require('../src/controllers/clientController').__test;

test('client lifecycle payload is sanitized and limited before persistence', () => {
  const result = cleanClientLifecycle({
    milestones: {
      leadClosure: {
        date: '2026-09-22', completed: 'yes', remark: ' Closed ',
        moms: [{ id: 'mom-1', date: '2026-09-22', subject: ' Kickoff ', points: [' First action ', ''] }],
        proofs: [{ name: 'proof.pdf', secureUrl: 'https://cdn.example.com/proof.pdf' }, { url: 'javascript:alert(1)' }]
      }
    },
    workFollowUps: [{ id: 'work-1', remark: ' Call client ', date: '2026-09-23', status: 'Unknown' }],
    injected: true
  });
  assert.equal(result.milestones.leadClosure.completed, 'yes');
  assert.equal(result.milestones.leadClosure.remark, 'Closed');
  assert.deepEqual(result.milestones.leadClosure.moms[0].points, ['First action']);
  assert.equal(result.milestones.leadClosure.proofs.length, 1);
  assert.equal(result.workFollowUps[0].status, 'Pending');
  assert.equal(result.injected, undefined);
});

test('client lifecycle tracker is wired to its protected persistence endpoint', () => {
  const routes = read('backend/src/routes/clients.js');
  const controller = read('backend/src/controllers/clientController.js');
  const endpoints = read('frontend/src/services/apiEndpoints.js');
  assert.match(routes, /router\.put\('\/:id\/lifecycle', requireAuth, clientCtrl\.updateClientLifecycle\)/);
  assert.match(controller, /exports\.updateClientLifecycle/);
  assert.match(controller, /client\.data = \{ \.\.\.currentData, clientLifecycle: lifecycle \}/);
  assert.match(endpoints, /lifecycle: \(id\) => `\/clients\/\$\{encodePathValue\(id\)\}\/lifecycle`/);
});

test('ticket tab renders milestone, MOM, proof and work follow-up controls', () => {
  const page = read('frontend/src/pages/ClientMaster.jsx');
  const tracker = read('frontend/src/features/clientMaster/ClientLifecycleTracker.jsx');
  assert.match(page, /<ClientLifecycleTracker client=\{client\} data=\{data\}/);
  assert.match(tracker, /Lead Closure/);
  assert.match(tracker, /PO Received/);
  assert.match(tracker, /Kick-off Meeting/);
  assert.match(tracker, /Add point/);
  assert.match(tracker, /Add proof/);
  assert.match(tracker, /Work follow-ups/);
  assert.match(tracker, /Done & save all/);
  assert.match(tracker, /Sales Process Checklist/);
  assert.match(tracker, /Showing 1 to 3 of 3 steps/);
  assert.match(tracker, /deriveAutoStages/);
  assert.match(tracker, /Lead Closure and PO update automatically/);
  assert.match(tracker, /disabled=\{milestone\.auto\}/);
});

test('client detail fetch includes lead closure and PO assignment source fields', () => {
  const controller = read('backend/src/controllers/clientController.js');
  assert.match(controller, /leadDate importedCreatedAt createdAt closedAt closureDate closedBy closedByText closedOnBehalfOfName/);
  assert.match(controller, /serviceSelections addresses contacts assignments/);
});
