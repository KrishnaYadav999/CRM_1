const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/controllers/clientController');

test('CPCB updates preserve data belonging to other assigned services', () => {
  const serviceA = 'service_assignment_001';
  const serviceB = 'service_assignment_002';
  const existing = {
    cpcbDataByAssignedServiceId: {
      [serviceA]: {
        cpcb: { registrationNumber: 'A-REG', remark: 'Annual return' },
        cpcbScreenshots: Array.from({ length: 4 }, (_, index) => ({ documentId: `a-${index}`, assignedServiceId: serviceA }))
      }
    }
  };
  const incoming = {
    cpcbDataByAssignedServiceId: {
      [serviceB]: {
        cpcb: { registrationNumber: 'B-REG', remark: 'Credit procurement' },
        cpcbScreenshots: Array.from({ length: 4 }, (_, index) => ({ documentId: `b-${index}`, assignedServiceId: serviceB }))
      }
    }
  };

  const saved = __test.mergeAssignedServiceCpcbData(existing, incoming);
  assert.deepEqual(saved.cpcbDataByAssignedServiceId[serviceA], existing.cpcbDataByAssignedServiceId[serviceA]);
  assert.deepEqual(saved.cpcbDataByAssignedServiceId[serviceB], incoming.cpcbDataByAssignedServiceId[serviceB]);
});

test('deleting a Service B document cannot delete a Service A document', () => {
  const serviceA = 'service_assignment_001';
  const serviceB = 'service_assignment_002';
  const existing = {
    cpcbDataByAssignedServiceId: {
      [serviceA]: { cpcbScreenshots: [{ documentId: 'a-1', assignedServiceId: serviceA }] },
      [serviceB]: { cpcbScreenshots: [{ documentId: 'b-1', assignedServiceId: serviceB }, { documentId: 'b-2', assignedServiceId: serviceB }] }
    }
  };
  const incoming = {
    cpcbDataByAssignedServiceId: {
      [serviceB]: { cpcbScreenshots: [{ documentId: 'b-2', assignedServiceId: serviceB }] }
    }
  };

  const saved = __test.mergeAssignedServiceCpcbData(existing, incoming);
  assert.deepEqual(saved.cpcbDataByAssignedServiceId[serviceA].cpcbScreenshots, existing.cpcbDataByAssignedServiceId[serviceA].cpcbScreenshots);
  assert.deepEqual(saved.cpcbDataByAssignedServiceId[serviceB].cpcbScreenshots, incoming.cpcbDataByAssignedServiceId[serviceB].cpcbScreenshots);
});
