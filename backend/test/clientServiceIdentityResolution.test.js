const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientMaster.jsx'), 'utf8');
const helperSource = page.slice(
  page.indexOf('function readAssignedServiceId'),
  page.indexOf('export default function ClientMaster')
);
const context = { result: null };
vm.runInNewContext(`${helperSource}\nresult = activateAssignedService;`, context);
const activateAssignedService = context.result;

test('ADF Foods Brand Owner and Importer resolve independent CPCB credentials', () => {
  const leadId = '6a7427653e6eb1b90295f6d0';
  const importerServiceId = 'service_assignment_d6ee55c1-62b5-41f7-bce8-5ca3802f5c36';
  const brandOwnerRecord = {
    selectedLeadSnapshot: { id: leadId, piboCategory: 'Brand Owner', eprCategory: 'EPR - Plastic Waste' },
    basic: { clientLegalName: 'ADF FOODS LIMITED', piboCategory: 'Brand Owner', eprCategory: 'EPR - Plastic Waste' },
    cpcb: {
      registrationNumber: '2025020306544868123',
      ceprUserId: 'S202605-00000525',
      loginId: 'hiren@adf-foods.com'
    }
  };
  const importerRecord = {
    assignedServiceId: importerServiceId,
    selectedLeadSnapshot: { id: leadId, assignedServiceId: importerServiceId, piboCategory: 'Importer', plantUnit: 'Unit 1' },
    basic: { clientLegalName: 'ADF FOODS LIMITED', piboCategory: 'Importer', eprCategory: 'EPR - Plastic Waste', servicesOffered: 'Annual Return Filling' },
    cpcb: {
      registrationNumber: '2024111308544863899',
      ceprUserId: 'S202606-00000049',
      loginId: 'co_secretary@adf-foods.com'
    }
  };

  const brandOwner = activateAssignedService(brandOwnerRecord, {
    assignedServiceId: 'service-brand-owner',
    subApplicantType: 'Brand Owner',
    eprCategory: 'EPR - Plastic Waste'
  }, 2);
  const importer = activateAssignedService(importerRecord, {
    assignedServiceId: importerServiceId,
    subApplicantType: 'Importer',
    eprCategory: 'EPR - Plastic Waste',
    servicesOffered: 'Annual Return Filling',
    plantUnit: 'Unit 1'
  }, 2);

  assert.deepEqual(
    [brandOwner.cpcb.registrationNumber, brandOwner.cpcb.ceprUserId, brandOwner.cpcb.loginId],
    ['2025020306544868123', 'S202605-00000525', 'hiren@adf-foods.com']
  );
  assert.deepEqual(
    [importer.cpcb.registrationNumber, importer.cpcb.ceprUserId, importer.cpcb.loginId],
    ['2024111308544863899', 'S202606-00000049', 'co_secretary@adf-foods.com']
  );
});

test('a record belonging to another assignment cannot supply generic CPCB or screenshots', () => {
  const resolved = activateAssignedService({
    assignedServiceId: 'service-importer',
    cpcb: { registrationNumber: 'IMPORTER-REG' },
    cpcbScreenshots: [{ documentId: 'importer-document', assignedServiceId: 'service-importer' }]
  }, {
    assignedServiceId: 'service-brand-owner',
    subApplicantType: 'Brand Owner'
  }, 2);

  assert.equal(resolved.cpcb.registrationNumber, undefined);
  assert.equal(resolved.cpcbScreenshots.length, 0);
});
