const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/controllers/clientController');

test('buildCcpClientApprovalPayload preserves full CCP client data', () => {
  const ccpClient = {
    _id: 'ccp-client-123',
    adminControls: {
      approvalStatus: 'PENDING',
      visibilityStatus: 'LIVE',
      assignedTo: { id: '', ccpUserId: '', email: '', name: 'SIDDHESH NIKAM' }
    },
    data: {
      basic: {
        clientLegalName: 'Acme Industries',
        piboCategory: 'Producer',
        eprCategory: 'EPR - Plastic Waste',
        firstAnnualReturnYear: '2023'
      },
      registeredAddress: {
        address1: 'Plot 1',
        city: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380001'
      },
      communicationAddress: {
        address1: 'Office 2',
        city: 'Surat'
      },
      compliance: {
        gst: '24ABCDE1234F1Z5',
        pan: 'ABCDE1234F'
      },
      msmeRows: [{ status: 'Small', udyamNumber: 'UDYAM-GJ-01' }],
      cte: { numberOfPlantsLocations: '2' },
      cpcb: { registrationNumber: 'CPCB-123', loginId: 'portal-user' },
      validation: { quotationNumber: 'Q-101' },
      otp: { mobile: '9999999999' },
      authorised: { name: 'Riya Shah', email: 'riya@example.com' },
      coordinating: { name: 'Dev Patel' },
      importMeta: { uniqueId: 'CCP-001', createdBy: 'CCP User' }
    }
  };

  const result = __test.buildCcpClientApprovalPayload({
    source: 'ccp',
    uniqueId: 'CRM-UNIQUE-1',
    sourceClientId: 'source-from-body',
    payload: ccpClient
  }, 'APPROVED', 'user-1', 'Approved from test');

  assert.equal(result.adminControls.approvalStatus, 'APPROVED');
  assert.equal(result.adminControls.visibilityStatus, 'LIVE');
  assert.equal(result.adminControls.assignedTo, undefined);
  assert.deepEqual(result.data.basic, ccpClient.data.basic);
  assert.equal(result.data.basic.firstAnnualReturnYear, '2023');
  assert.deepEqual(result.data.registeredAddress, ccpClient.data.registeredAddress);
  assert.deepEqual(result.data.compliance, ccpClient.data.compliance);
  assert.deepEqual(result.data.cpcb, ccpClient.data.cpcb);
  assert.deepEqual(result.data.authorised, ccpClient.data.authorised);
  assert.deepEqual(result.data.msmeRows, ccpClient.data.msmeRows);
  assert.equal(result.data.importMeta.createdBy, 'CCP User');
  assert.equal(result.data.importMeta.assignedTo, 'SIDDHESH NIKAM');
  assert.equal(result.data.importMeta.uniqueId, 'CRM-UNIQUE-1');
  assert.equal(result.data.importMeta.ccpClientId, 'source-from-body');
  assert.equal(result.data.importMeta.approvalOverride, true);
  assert.equal(result.data.approvalMeta.status, 'APPROVED');
});
