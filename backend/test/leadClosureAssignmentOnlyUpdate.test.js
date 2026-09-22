const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = require('../src/controllers/leadController');
const leadPage = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/LeadGeneration.jsx'), 'utf8');

test('closure submits only assignment workflow data instead of revalidating the complete legacy lead profile', () => {
  assert.equal(controller._test.isAssignmentOnlyLeadUpdate({ assignments: [{ assignedServiceId: 'service-1' }], workflowStatus: 'submitted' }), true);
  assert.equal(controller._test.isAssignmentOnlyLeadUpdate({ assignments: [{ assignedServiceId: 'service-1' }], workflowStatus: 'submitted', company: 'Changed company' }), false);
  assert.equal(controller._test.isAssignmentOnlyLeadUpdate({ assignments: [], workflowStatus: 'submitted' }), false);
  assert.equal(controller._test.isAssignmentOnlyLeadUpdate({ workflowStatus: 'submitted' }), false);

  const closureBlock = leadPage.slice(leadPage.indexOf('async function confirmLeadClosure'), leadPage.indexOf('function requestStaffAssignment'));
  assert.match(closureBlock, /const payload = \{[\s\S]*assignments: nextAssignments,[\s\S]*workflowStatus:/);
  assert.doesNotMatch(closureBlock, /buildLeadPayload\(/);
  assert.match(closureBlock, /\[POProof:closure:error\]/);
});

test('assignment-only closure keeps PO validation but bypasses unrelated submitted-profile and PIBO validation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/leadController.js'), 'utf8');
  assert.match(source, /const assignmentOnlyUpdate = isAssignmentOnlyLeadUpdate\(req\.body\)/);
  assert.match(source, /validateClosureAssignments\(\{ \.\.\.lead\.toObject\(\), \.\.\.data \}, beforeLead\)/);
  assert.match(source, /data\.workflowStatus === 'submitted' && !assignmentOnlyUpdate/);
  assert.match(source, /if \(!assignmentOnlyUpdate && \(\(!usesDirectApplicantType/);
});
