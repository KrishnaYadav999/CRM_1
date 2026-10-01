const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const utility = import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/operationsUserProgress.mjs'), 'utf8')).toString('base64')}`);
const dashboard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx'), 'utf8');
test('Final Flag is red only for all three breached thresholds; all other combinations are green', async () => {
  const { getOperationsFinalFlag } = await utility;
  for (let bits = 0; bits < 8; bits++) {
    const sla = Object.fromEntries([48,72,96].map((hour,index)=>[hour,{breached:Boolean(bits & (1<<index))}]));
    assert.equal(getOperationsFinalFlag(sla), bits === 7 ? 'red' : 'green');
  }
  assert.equal(getOperationsFinalFlag({}), 'green');
});
test('PO Financial Year overrides service period and annual filing years in dashboard filtering', async () => {
  const { getPoFinancialYear } = await utility;
  const source = dashboard.slice(dashboard.indexOf('function rowAppliesToFinancialYear('), dashboard.indexOf('const PO_APPLICANT_BUCKETS'));
  const context = { getPoFinancialYear, financialYearStart: (value) => Number(String(value).slice(0,4)) };
  vm.runInNewContext(source, context);
  const row = { poDetails: { poFinancialYear: '2025-26' }, poFinancialYear: '2026-27', firstAnnualReturnYear: '2023-24', annualReturns: [{ annualYear: '2026-27' }] };
  assert.equal(context.rowAppliesToFinancialYear(row, '2025-26'), true);
  assert.equal(context.rowAppliesToFinancialYear(row, '2026-27'), false);
  assert.equal(context.rowAppliesToFinancialYear({ firstAnnualReturnYear: '2023-24' }, '2026-27'), true, 'legacy rows retain existing year policy');
});
test('Annual Return and Registration KPI use explicit PO Financial Year before legacy service-year rules', () => {
  const source = dashboard.slice(dashboard.indexOf('function getComplianceRecordYears('), dashboard.indexOf('function buildComplianceKpi('));
  const context = { financialYearStart: (value) => Number(String(value || '').slice(0,4)) };
  vm.runInNewContext(source,context);
  for (const kind of ['annual','registration']) {
    const record = { kind, source: { clientMasterService: true, poFinancialYear: '2025-26', servicesForYear: '2026-27', firstAnnualReturnYear: '2023-24' } };
    assert.equal(context.complianceRecordAppliesToYear(record,'2025-26'),true);
    assert.equal(context.complianceRecordAppliesToYear(record,'2026-27'),false);
  }
});
const PendingApproval = require('../src/models/PendingApproval');
const controller = require('../src/controllers/leadController');
function response() { return { code: 200, status(code){ this.code=code;return this; }, json(body){ this.body=body;return this; } }; }
test('PO review endpoint returns the complete persisted submission and handles missing or invalid records', async () => {
  const find = PendingApproval.findOne;
  const id = '507f1f77bcf86cd799439011';
  const po = { fy:'2025-26',poNumber:'PP/EPR/001',poDate:'2025-01-09',poEndDate:'2027-03-31',poFinancialYear:'2025-26',paymentTerm:'50% remaining',poAmount:75000,poFileUrl:'https://example.com/po.pdf',services:['Annual Return Filling'] };
  PendingApproval.findOne = (query) => { assert.equal(query.type,'purchase_order');return { lean:async()=>query._id===id?{_id:id,payload:{poYearRows:[po]}}:null }; };
  try {
    const res=response();await controller.getPurchaseOrderApproval({params:{id}},res);
    assert.deepEqual(res.body.approval.payload.poYearRows[0],po);
    const missing=response();await controller.getPurchaseOrderApproval({params:{id:'507f1f77bcf86cd799439012'}},missing);assert.equal(missing.code,404);
    const invalid=response();await controller.getPurchaseOrderApproval({params:{id:'invalid'}},invalid);assert.equal(invalid.code,400);
  } finally { PendingApproval.findOne=find; }
});
test('PO review route blocks Operations users before accessing submission data', () => {
  const router = require('../src/routes/leads');
  const route = router.stack.find((layer)=>layer.route?.path==='/purchase-order-approvals/:id'&&layer.route.methods.get).route;
  const res=response();let passed=false;
  route.stack[1].handle({user:{role:'operation'}},res,()=>{passed=true;});
  assert.equal(passed,false);assert.equal(res.code,403);
});

test('explicit PO-year filters exclude unrecorded years and select the matching historical PO proof', async () => {
  const { selectRowsForPoFinancialYear } = await utility;
  const rows = [{ id:'one',firstAnnualReturnYear:'2025-26',poDetails:{ records:[{poFinancialYear:'2025-26',fileUrl:'https://example.com/old.pdf'},{poFinancialYear:'2026-27',fileUrl:'https://example.com/new.pdf'}] } }, { id:'legacy',firstAnnualReturnYear:'2025-26',poDetails:{} }];
  assert.equal(selectRowsForPoFinancialYear(rows,'all').length,2);
  assert.equal(selectRowsForPoFinancialYear(rows,'2025-26').length,1);
  assert.equal(selectRowsForPoFinancialYear(rows,'2025-26')[0].poDetails.fileUrl,'https://example.com/old.pdf');
  assert.equal(selectRowsForPoFinancialYear(rows,'2026-27')[0].poDetails.fileUrl,'https://example.com/new.pdf');
  assert.equal(selectRowsForPoFinancialYear(rows,'2029-30').length,0);
  assert.equal(selectRowsForPoFinancialYear(rows,'unrecorded')[0].id,'legacy');
});
