const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/controllers/quotationController.js'), 'utf8');

function load(name, context) {
  const start = source.indexOf(`exports.${name} =`);
  const next = source.indexOf('\nexports.', start + 1);
  context.exports = {};
  vm.runInNewContext(source.slice(start, next < 0 ? undefined : next), context);
  return context.exports[name];
}

for (const role of ['superadmin', 'admin']) {
  test(`${role}: final approval by someone other than the price approver`, async () => {
    let saved = false;
    let update;
    const quotation = {
      _id: 'quote', managementApproval: { status: 'PENDING', adminApprovalStatus: 'APPROVED', approverId: 'price-approver', approverName: 'Price reviewer', source: 'EMAIL', note: 'Price agreed' },
      save: async () => { saved = true; }
    };
    const handler = load('finalizeManagementApproval', {
      console, mongoose: { Types: { ObjectId: { isValid: () => true } } },
      Quotation: { findById: () => ({ populate: async () => quotation }) },
      PendingApproval: { updateMany: async (filter, changes) => { update = changes.$set; } },
      sendQuotationLifecycleEmail: async () => ({})
    });
    let code = 200;
    let response;
    const res = { status(value) { code = value; return this; }, json(value) { response = value; } };
    await handler({ params: { id: 'quote' }, body: {}, user: { _id: 'different-reviewer', role, name: 'Final reviewer' } }, res);
    if (role === 'admin') {
      assert.equal(code, 403);
      assert.equal(saved, false);
      return;
    }
    assert.equal(code, 200);
    assert.equal(response.approvalStatus, 'APPROVED');
    assert.equal(saved, true);
    assert.equal(update.approvalStatus, 'APPROVED');
    assert.equal(quotation.managementApproval.approverId, 'price-approver');
    assert.equal(quotation.managementApproval.actionBy, 'different-reviewer');
    assert.equal(quotation.approvalDecision.actionBy, 'different-reviewer');
  });
}

test('bulk approval considers pending quotations for all price approvers', async () => {
  let filter;
  const handler = load('approveAllPendingQuotations', {
    console, PendingApproval: { find: async (query) => { filter = query; return []; } }
  });
  await handler({ body: {}, user: { _id: 'different-reviewer', role: 'superadmin' } }, { json() {} });
  assert.equal(filter['payload.managementApproverId'], undefined);
  assert.equal(filter['payload.adminApprovalStatus'], 'APPROVED');
  assert.equal(filter.approvalStatus, 'PENDING');
});
