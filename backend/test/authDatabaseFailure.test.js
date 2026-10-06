const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function middleware({ user, failure, tokenFailure } = {}) {
  const context = { module: { exports: {} }, process: { env: {} }, console: { error() {} }, require(name) {
    if (name === 'jsonwebtoken') return { verify() { if (tokenFailure) throw tokenFailure; return { sub: 'valid-id' }; } };
    if (name === '../models/User') return { findById() { return { select() { return { async maxTimeMS(limit) { assert.equal(limit, 10000); if (failure) throw failure; return user; } }; } }; } };
    if (name === './activityAudit') return { activityAudit: (_req, _res, next) => next() };
    if (name === '../utils/userRoles') return { userHasAnyRole: () => true };
    throw new Error(`Unexpected dependency ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/middleware/auth.js'), 'utf8'), context);
  return context.module.exports.requireAuth;
}
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set(name, value) { this[name] = value; } }; }

test('database errors return retryable 503 rather than invalidating a valid login', async () => {
  const res = response(); let next = false;
  await middleware({ failure: Object.assign(new Error('unavailable'), { name: 'MongoServerSelectionError' }) })({ headers: { authorization: 'Bearer test' } }, res, () => { next = true; });
  assert.equal(res.code, 503);
  assert.equal(res['Retry-After'], '2');
  assert.equal(next, false);
  assert.ok(!res.body.error.includes('Invalid or expired'));
});
test('expired tokens and inactive users still receive 401', async () => {
  for (const config of [{ tokenFailure: Object.assign(new Error('expired'), { name: 'TokenExpiredError' }) }, { user: { isActive: false } }]) {
    const res = response();
    await middleware(config)({ headers: { authorization: 'Bearer test' } }, res, () => assert.fail('Must not authenticate'));
    assert.equal(res.code, 401);
  }
});
test('active users continue to authentication auditing', async () => {
  const req = { headers: { authorization: 'Bearer test' } }; let called = false;
  await middleware({ user: { _id: 'valid-id', isActive: true } })(req, response(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user._id, 'valid-id');
});
