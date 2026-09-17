const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Client Master directory exposes the manager staff-allocation workflow', () => {
  const directory = read('frontend/src/features/clientMaster/ClientDirectoryView.jsx');
  const page = read('frontend/src/pages/ClientMaster.jsx');

  assert.match(directory, /Manager Staff AssignmentHeader|ManagerStaffAssignmentHeader/);
  assert.match(directory, /\['manager', 'admin', 'superadmin'\]\.includes\(normalizedRole\)/);
  assert.match(directory, /Assign Staff Now/);
  assert.match(directory, /Sales se manager handover complete/);
  assert.match(page, /onOpenAllocation=\{\(\) => navigate\('\/sales\/client-master-allocate'\)\}/);
});

test('manager ownership remains separate from allocated staff ownership', () => {
  const utils = read('frontend/src/features/clientMaster/clientMaster.utils.js');
  const assignedManager = utils.slice(utils.indexOf('function getAssignedName'), utils.indexOf('function getAssignedStaffNames'));
  const assignedStaff = utils.slice(utils.indexOf('function getAssignedStaffNames'), utils.indexOf('function getCpcbStatus'));
  const controller = read('backend/src/controllers/clientController.js');
  const allocation = controller.slice(controller.indexOf('exports.upsertClientServiceAllocations'), controller.indexOf('module.exports.__test'));

  assert.doesNotMatch(assignedManager, /serviceAllocations/);
  assert.match(assignedStaff, /serviceAllocations/);
  assert.match(allocation, /await clientAccessFilter\(req\.user\)/);
  assert.doesNotMatch(allocation, /updatePayload\.\$set\['adminControls\.assignedTo'\]/);
});

test('Client Details provides a consolidated viewer for every uploaded document type', () => {
  const page = read('frontend/src/pages/ClientMaster.jsx');

  assert.match(page, /function collectClientDocuments/);
  assert.match(page, /file\|document\|image\|screenshot\|proof\|diagram\|attachment\|certificate/);
  assert.match(page, /id: 'documents'/);
  assert.match(page, /function ClientDocumentLibrary/);
  assert.match(page, /Every uploaded client file in one place/);
  assert.match(page, /openableClientDocumentUrl\(document\.url\)/);
});
