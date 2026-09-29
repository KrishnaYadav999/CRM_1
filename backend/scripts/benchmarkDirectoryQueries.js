require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Lead = require('../src/models/Lead');
const Client = require('../src/models/Client');
const User = require('../src/models/User');
const { getVisibleUserScope, ownerFilter } = require('../src/utils/visibilityScope');

function elapsed(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

async function timed(label, operation) {
  const startedAt = process.hrtime.bigint();
  const value = await operation();
  console.log(`${label}: ${elapsed(startedAt).toFixed(2)}ms`);
  return value;
}

function leadOwnerFilter(scope) {
  return ownerFilter(scope, 'createdBy', 'assignedTo', [
    'createdByCrmUserId', 'createdByName', 'createdByEmail', 'importedCreatedBy',
    'generatedForName', 'generatedForEmail', 'assignedToText', 'assignedToEmail',
    'assignedStaffText', 'assignedStaffEmail', 'assignments.assignedToText',
    'assignments.assignedToEmail', 'assignments.assignedStaffText',
    'assignments.assignedStaffEmail', 'serviceSelections.createdByCrmUserId',
    'serviceSelections.createdByName', 'serviceSelections.createdByEmail'
  ], ['generatedForUser', 'assignedStaff', 'assignments.assignedTo', 'assignments.assignedStaff']);
}

async function resolveBenchmarkUser() {
  const requestedEmail = String(process.env.BENCHMARK_USER_EMAIL || '').trim().toLowerCase();
  const query = requestedEmail
    ? { email: requestedEmail }
    : process.argv.includes('--manager')
      ? { role: 'manager', isActive: { $ne: false } }
      : { role: { $in: ['superadmin', 'admin'] }, isActive: { $ne: false } };
  return User.findOne(query).select('_id crmUserId name email role roles').lean();
}

async function run() {
  await connectDB();
  const user = await resolveBenchmarkUser();
  if (!user) throw new Error('No benchmark user found. Set BENCHMARK_USER_EMAIL to an existing CRM user.');
  console.log(`Benchmark role: ${user.role || (user.roles || []).join(',')}`);

  if (process.argv.includes('--baseline-payload')) {
    const leads = await timed('Lead legacy full query', () => Lead.find({})
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('closedBy', 'name email avatarUrl role')
      .populate('createdBy', 'name email')
      .populate('generatedForUser', 'name email crmUserId')
      .sort({ leadCode: 1, createdAt: 1 }).lean());
    console.log(`Lead legacy payload: ${Buffer.byteLength(JSON.stringify({ ok: true, leads }))} bytes`);
    const clients = await timed('Client legacy full query', () => Client.find({ 'data.importMeta.approvalOverride': { $ne: true } })
      .select('-data.companyOverview.productImage -data.cpcbScreenshots -data.processDiagrams -data.cpcbDataByAssignedServiceId -data.serviceDetailsByAssignedServiceId -data.annualReturn -data.financials -data.compliance.gstFile -data.compliance.cinFile -data.compliance.panFile -data.compliance.factoryLicenseFile -data.compliance.eprCertificateFile -data.compliance.iecFile -data.compliance.dicDcssiFile -data.msmeRows.file -data.cte.plantWiseDetails.cteDocument -data.cte.plantWiseDetails.ctoDocument -data.authorised.panDocument -data.authorisedPersons.panDocument -data.authorised.aadhaarDocument -data.authorisedPersons.aadhaarDocument')
      .populate('selectedLead', 'leadCode company status eprCategory applicantType subApplicantType piboParent serviceSelections createdBy createdByName createdByEmail importedCreatedBy assignedTo assignedToText assignedStaff assignedStaffText assignedStaffEmail assignments assignReachedAt closedAt closedByText createdAt updatedAt')
      .populate('createdBy', 'name email role avatarUrl')
      .populate('adminControls.assignedTo', 'name email role avatarUrl')
      .sort({ createdAt: -1 }).lean());
    console.log(`Client legacy payload: ${Buffer.byteLength(JSON.stringify({ ok: true, clients }))} bytes`);
    return;
  }

  if (process.env.BENCHMARK_FAST === 'true' || process.argv.includes('--fast')) {
    const leadController = require('../src/controllers/leadController');
    const clientController = require('../src/controllers/clientController');
    const invoke = async (label, handler) => {
      let body;
      const headers = {};
      const response = {
        set(name, value) { headers[name] = value; return this; },
        status() { return this; },
        json(value) { body = value; return value; }
      };
      await timed(label, () => handler({ user, query: { paginated: 'true', page: '1', limit: '10' } }, response));
      console.log(`${label} payload: ${Buffer.byteLength(JSON.stringify(body))} bytes`);
      console.log(`${label} server timing: ${headers['Server-Timing'] || 'n/a'}`);
    };
    await invoke('Lead paginated controller', leadController.listLeads);
    await invoke('Client paginated controller', clientController.listClients);
    const [leadIndexes, clientIndexes] = await Promise.all([Lead.collection.indexes(), Client.collection.indexes()]);
    console.log('Lead indexes:', leadIndexes.map(({ name, key }) => ({ name, key })));
    console.log('Client indexes:', clientIndexes.map(({ name, key }) => ({ name, key })));
    return;
  }

  const scope = await timed('lead access filter', () => getVisibleUserScope(user));
  const accessFilter = leadOwnerFilter(scope);
  const leadCount = await Lead.countDocuments(accessFilter);
  console.log(`Lead records visible: ${leadCount}`);

  const leadBase = () => Lead.find(accessFilter).sort({ leadCode: 1, createdAt: 1 }).lean();
  await timed('Lead.find only (all, lean)', () => leadBase().exec());
  for (const [path, select] of [
    ['assignedTo', 'name email avatarUrl role'],
    ['closedBy', 'name email avatarUrl role'],
    ['createdBy', 'name email'],
    ['generatedForUser', 'name email crmUserId']
  ]) {
    await timed(`Lead.find + populate ${path} (all, lean)`, () => leadBase().populate(path, select).exec());
  }
  const fullLeads = await timed('Lead current full query (all, lean)', () => leadBase()
    .populate('assignedTo', 'name email avatarUrl role')
    .populate('closedBy', 'name email avatarUrl role')
    .populate('createdBy', 'name email')
    .populate('generatedForUser', 'name email crmUserId')
    .exec());
  await timed('Lead JSON serialization (all)', async () => JSON.stringify({ ok: true, leads: fullLeads }));
  console.log(`Lead full payload: ${Buffer.byteLength(JSON.stringify({ ok: true, leads: fullLeads }))} bytes`);
  const leadPage = await timed('Lead projected page query (10, lean)', () => Lead.find(accessFilter)
    .select('leadCode company status eprCategory piboCategory contactPerson mobileNo1 emails state city pinCode existingClient recordStatus assignedTo assignedToText assignedStaff assignedStaffText assignedStaffEmail assignments serviceSelections createdBy createdByName createdByEmail importedCreatedBy generatedForUser generatedForName generatedForEmail createdAt updatedAt')
    .sort({ leadCode: 1, createdAt: 1 }).limit(10).lean()
    .populate('assignedTo', 'name email avatarUrl role')
    .populate('createdBy', 'name email')
    .populate('generatedForUser', 'name email crmUserId')
    .exec());
  await timed('Lead JSON serialization (page 10)', async () => JSON.stringify({ ok: true, leads: leadPage }));
  console.log(`Lead page payload: ${Buffer.byteLength(JSON.stringify({ ok: true, leads: leadPage }))} bytes`);

  const clientScope = await timed('client access scope', () => getVisibleUserScope(user));
  const directClientAccess = ownerFilter(clientScope, 'createdBy', 'adminControls.assignedTo', [
    'data.importMeta.assignedTo', 'data.importMeta.user', 'data.importMeta.userName',
    'data.importMeta.createdBy', 'data.importMeta.createdByEmail'
  ]);
  const clientFilter = { $and: [{ 'data.importMeta.approvalOverride': { $ne: true } }, directClientAccess] };
  const clientCount = await Client.countDocuments(clientFilter);
  console.log(`Client records visible (direct admin-compatible filter): ${clientCount}`);
  const clients = await timed('Client current query projection/populates (all, lean)', () => Client.find(clientFilter)
    .select('-data.companyOverview.productImage -data.cpcbScreenshots -data.processDiagrams -data.cpcbDataByAssignedServiceId -data.serviceDetailsByAssignedServiceId -data.annualReturn -data.financials -data.compliance.gstFile -data.compliance.cinFile -data.compliance.panFile -data.compliance.factoryLicenseFile -data.compliance.eprCertificateFile -data.compliance.iecFile -data.compliance.dicDcssiFile -data.msmeRows.file -data.cte.plantWiseDetails.cteDocument -data.cte.plantWiseDetails.ctoDocument -data.authorised.panDocument -data.authorisedPersons.panDocument -data.authorised.aadhaarDocument -data.authorisedPersons.aadhaarDocument')
    .populate('selectedLead', 'leadCode company status eprCategory applicantType subApplicantType piboParent serviceSelections createdBy createdByName createdByEmail importedCreatedBy assignedTo assignedToText assignedStaff assignedStaffText assignedStaffEmail assignments assignReachedAt closedAt closedByText createdAt updatedAt')
    .populate('createdBy', 'name email role avatarUrl')
    .populate('adminControls.assignedTo', 'name email role avatarUrl')
    .sort({ createdAt: -1 }).lean().exec());
  await timed('Client JSON serialization (all)', async () => JSON.stringify({ ok: true, clients }));
  console.log(`Client full payload: ${Buffer.byteLength(JSON.stringify({ ok: true, clients }))} bytes`);
  const clientPage = await timed('Client projected page query (10, lean)', () => Client.find(clientFilter)
    .select('_id selectedLead assignedServiceId companyIdentity adminControls workflowStatus createdBy createdAt updatedAt serviceAllocations data.selectedLead data.assignedServiceId data.selectedLeadSnapshot data.basic data.registeredAddress data.communicationAddress data.otp data.authorised data.coordinating data.msmeRows data.cpcb data.importMeta data.companyOverview.companyName')
    .populate('selectedLead', 'leadCode company status assignedTo assignedToText assignedStaff assignedStaffText assignedStaffEmail assignments')
    .populate('createdBy', 'name email role avatarUrl')
    .populate('adminControls.assignedTo', 'name email role avatarUrl')
    .sort({ createdAt: -1 }).limit(10).lean().exec());
  await timed('Client JSON serialization (page 10)', async () => JSON.stringify({ ok: true, clients: clientPage }));
  console.log(`Client page payload: ${Buffer.byteLength(JSON.stringify({ ok: true, clients: clientPage }))} bytes`);

  const [leadIndexes, clientIndexes] = await Promise.all([Lead.collection.indexes(), Client.collection.indexes()]);
  console.log('Lead indexes:', leadIndexes.map(({ name, key }) => ({ name, key })));
  console.log('Client indexes:', clientIndexes.map(({ name, key }) => ({ name, key })));
  const leadExplain = await Lead.find(accessFilter).sort({ leadCode: 1, createdAt: 1 }).limit(10).lean().explain('executionStats');
  const leadStats = leadExplain.executionStats || {};
  console.log('Lead explain:', {
    executionTimeMillis: leadStats.executionTimeMillis,
    totalDocsExamined: leadStats.totalDocsExamined,
    totalKeysExamined: leadStats.totalKeysExamined,
    winningStage: leadExplain.queryPlanner?.winningPlan?.stage || leadExplain.queryPlanner?.winningPlan?.queryPlan?.stage
  });
}

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
