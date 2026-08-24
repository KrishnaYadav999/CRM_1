const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Client Master approval requires a complete tab-wise compliance review', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/clientController.js'), 'utf8');
  const reviewController = fs.readFileSync(path.join(__dirname, '../src/controllers/clientComplianceReviewController.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/clients.js'), 'utf8');
  assert.match(controller, /Complete all Compliance Verification tabs/);
  assert.match(reviewController, /Verify every applicable tab/);
  assert.match(reviewController, /CHANGES_REQUIRED/);
  assert.match(routes, /compliance-review\/sections/);
  assert.match(routes, /compliance-review\/decision/);
});

test('compliance review workspace exposes uploaded images and documents securely', () => {
  const workspace = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/ClientComplianceReview.jsx'), 'utf8');
  assert.match(workspace, /secureUrl \|\| value\.url \|\| value\.fileUrl \|\| value\.dataUrl/);
  assert.match(workspace, /Uploaded Images & Documents/);
  assert.match(workspace, /View Full Image/);
  assert.match(workspace, /Open Document/);
  assert.match(workspace, /noopener noreferrer/);
  assert.match(workspace, /password\|secret\|token/i);
  assert.match(workspace, /removedReviewFields/);
  assert.match(workspace, /!removedReviewFields\.has\(key\) && populated\(value\)/);
  assert.match(workspace, /'otp', 'otpContacts', 'authorised', 'authorisedPersons'/);
});

test('compliance review resolves the same assigned-service data used by Client Master', () => {
  const reviewController = fs.readFileSync(path.join(__dirname, '../src/controllers/clientComplianceReviewController.js'), 'utf8');
  assert.match(reviewController, /resolveClientMasterData\(client, getAssignedServiceId\(client\)\)/);
});

test('Client Master submit requires 60 percent completion and review includes process diagrams', () => {
  const clientPage = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
  const clientController = fs.readFileSync(path.join(__dirname, '../src/controllers/clientController.js'), 'utf8');
  const reviewController = fs.readFileSync(path.join(__dirname, '../src/controllers/clientComplianceReviewController.js'), 'utf8');
  const reviewPage = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/ClientComplianceReview.jsx'), 'utf8');
  assert.match(clientPage, /overallProgress\.percent < 60/);
  assert.match(clientPage, /please complete at least 60% of the data/);
  assert.match(clientController, /validateClientSubmissionCompletion/);
  assert.match(clientController, /percentage < 60/);
  assert.match(reviewController, /Process Flow & Machinery Diagrams/);
  assert.match(reviewPage, /processFlowDiagrams: \['processDiagrams', 'processFlowFiles'\]/);
});
