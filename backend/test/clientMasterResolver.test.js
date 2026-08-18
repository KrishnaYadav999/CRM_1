const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const {
  normalizeClientMaster,
  resolveClientMasterData
} = require('../src/services/clientMasterResolver');

const records = [
  {
    name: 'legacy root sections',
    record: { _id: '000000000000000000000001', companyName: 'Legacy Root Ltd', piboCategory: 'Producer', cpcb: { status: 'Approved' } },
    expect: { companyName: 'Legacy Root Ltd', piboCategory: 'Producer', legacy: true, cpcbStatus: 'Approved' }
  },
  {
    name: 'modern data envelope',
    record: { _id: '000000000000000000000002', selectedLead: '100000000000000000000002', assignedServiceId: 'svc-2', data: { basic: { clientLegalName: 'Modern Ltd', piboCategory: 'Importer' } } },
    expect: { companyName: 'Modern Ltd', piboCategory: 'Importer', legacy: false }
  },
  {
    name: 'populated ObjectId-like lead',
    record: { _id: '000000000000000000000003', selectedLead: { _id: '100000000000000000000003', leadCode: 'ATPL-3', company: 'Populated Ltd' }, data: {} },
    expect: { companyName: 'Populated Ltd', selectedLead: '100000000000000000000003', legacy: true }
  },
  {
    name: 'data selectedLead string',
    record: { _id: '000000000000000000000004', data: { selectedLead: '100000000000000000000004', companyOverview: { companyName: 'Data Lead Ltd' } } },
    expect: { companyName: 'Data Lead Ltd', selectedLead: '100000000000000000000004', legacy: true }
  },
  {
    name: 'snapshot identifiers',
    record: { _id: '000000000000000000000005', data: { selectedLeadSnapshot: { id: '100000000000000000000005', assignedServiceId: 'svc-5', leadCode: 'ATPL-5', company: 'Snapshot Ltd', plantUnit: 'Unit 5' } } },
    expect: { companyName: 'Snapshot Ltd', assignedServiceId: 'svc-5', plantUnit: 'Unit 5', legacy: false }
  },
  {
    name: 'import metadata fallback',
    record: { _id: '000000000000000000000006', data: { importMeta: { companyName: 'Imported Ltd', leadNumber: 'ATPL-6' } } },
    expect: { companyName: 'Imported Ltd', leadCode: 'ATPL-6', legacy: true }
  },
  {
    name: 'service scoped CPCB',
    record: { _id: '000000000000000000000007', assignedServiceId: 'svc-7', data: { basic: { clientLegalName: 'Scoped CPCB Ltd' }, cpcb: { status: 'Draft' }, cpcbDataByAssignedServiceId: { 'svc-7': { cpcb: { status: 'Approved', registrationNumber: 'CPCB-7' } } } } },
    expect: { companyName: 'Scoped CPCB Ltd', cpcbStatus: 'Approved', legacy: false }
  },
  {
    name: 'service details sections',
    record: { _id: '000000000000000000000008', data: { assignedServiceId: 'svc-8', basic: { tradeName: 'Service Detail Ltd' }, serviceDetailsByAssignedServiceId: { 'svc-8': { authorised: { name: 'Authorized Eight' }, otpContacts: [{ mobile: '8000000000' }] } } } },
    expect: { companyName: 'Service Detail Ltd', authorisedName: 'Authorized Eight', legacy: false }
  },
  {
    name: 'duplicate PIBO separate record one',
    record: { _id: '000000000000000000000009', assignedServiceId: 'svc-9a', data: { basic: { clientLegalName: 'Multi Ltd', piboCategory: 'Brand Owner', servicesOffered: 'Registration' }, selectedLeadSnapshot: { plantUnit: 'Unit 1' } } },
    expect: { companyName: 'Multi Ltd', assignedServiceId: 'svc-9a', plantUnit: 'Unit 1', legacy: false }
  },
  {
    name: 'duplicate PIBO separate record two missing optionals',
    record: { _id: '000000000000000000000010', data: { basic: { clientLegalName: 'Multi Ltd', piboCategory: 'Brand Owner' }, selectedLeadSnapshot: { assignedServiceId: 'svc-9b', plantUnit: 'Unit 2' } } },
    expect: { companyName: 'Multi Ltd', assignedServiceId: 'svc-9b', plantUnit: 'Unit 2', legacy: false }
  }
];

for (const fixture of records) {
  test(`normalizes ${fixture.name}`, () => {
    const summary = normalizeClientMaster(fixture.record);
    const resolved = resolveClientMasterData(fixture.record, summary.assignedServiceId);
    Object.entries(fixture.expect).forEach(([key, value]) => {
      if (key === 'cpcbStatus') assert.equal(resolved.cpcb?.status, value);
      else if (key === 'authorisedName') assert.equal(resolved.authorised?.name, value);
      else assert.equal(summary[key], value);
    });
    assert.equal(summary.clientMasterId, fixture.record._id);
  });
}

test('requested service id deterministically selects a nested service without changing record identity', () => {
  const record = {
    _id: '000000000000000000000011',
    data: {
      cpcb: { status: 'Legacy' },
      cpcbDataByAssignedServiceId: {
        first: { cpcb: { status: 'First' } },
        second: { cpcb: { status: 'Second' } }
      }
    }
  };
  assert.equal(resolveClientMasterData(record, 'second').cpcb.status, 'Second');
  assert.equal(normalizeClientMaster(record).clientMasterId, record._id);
});

test('Mongoose ObjectId-like selectedLead values normalize to strings', () => {
  const selectedLead = { toHexString: () => '100000000000000000000012' };
  const result = normalizeClientMaster({ _id: '000000000000000000000012', selectedLead, data: {} });
  assert.equal(result.selectedLead, '100000000000000000000012');
});

test('real Mongoose ObjectIds normalize without following the recursive id getter', () => {
  const selectedLead = new mongoose.Types.ObjectId('100000000000000000000013');
  const result = normalizeClientMaster({
    _id: new mongoose.Types.ObjectId('000000000000000000000013'),
    selectedLead,
    data: {}
  });
  assert.equal(result.clientMasterId, '000000000000000000000013');
  assert.equal(result.selectedLead, '100000000000000000000013');
});
