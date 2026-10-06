const test = require('node:test');
const assert = require('node:assert/strict');
const Notification = require('../src/models/Notification');
const controller = require('../src/controllers/notificationController');
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('read acknowledgement is per account, idempotent and new announcements require another read', async () => {
  const first = '507f1f77bcf86cd799439011', second = '507f1f77bcf86cd799439012';
  const alice = '507f1f77bcf86cd799439021', bob = '507f1f77bcf86cd799439022';
  const items = [{ _id: first, title: 'Policy update', kind: 'announcement', status: 'Active', readBy: [], hiddenBy: [alice] }];
  const find = Notification.find, update = Notification.updateOne;
  Notification.find = (query) => {
    assert.equal(query.kind, 'announcement'); assert.equal(query.status, 'Active');
    const builder = { select() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return items.filter((item) => item.kind === query.kind && item.status === query.status && !item.readBy.includes(query.readBy.$ne)); } };
    return builder;
  };
  Notification.updateOne = async (query, changes) => {
    assert.deepEqual(Object.keys(changes), ['$addToSet']);
    const item = items.find((item) => item._id === query._id && item.kind === query.kind && item.status === query.status);
    if (!item) return { matchedCount: 0 };
    const user = changes.$addToSet.readBy;
    if (!item.readBy.includes(user)) item.readBy.push(user);
    return { matchedCount: 1 };
  };
  const unread = async (user) => { const res = response(); await controller.unreadAnnouncements({ user: { _id: user } }, res); return res.body.announcements; };
  const mark = async (user, id = first) => { const res = response(); await controller.markAnnouncementRead({ user: { _id: user }, params: { id }, body: { userId: bob } }, res); return res; };
  try {
    assert.equal((await unread(alice)).length, 1, 'clearing bell does not acknowledge announcement');
    assert.equal((await mark(alice)).code, 200); await mark(alice);
    assert.deepEqual(items[0].readBy, [alice]);
    assert.equal((await unread(alice)).length, 0, 'next login no longer shows acknowledged item');
    assert.equal((await unread(bob)).length, 1, 'other user must acknowledge separately');
    items.push({ _id: second, kind: 'announcement', status: 'Active', readBy: [] });
    assert.deepEqual((await unread(alice)).map((item) => item.id), [second]);
    items[1].status = 'Inactive';
    assert.equal((await mark(alice, second)).code, 404);
    assert.equal((await mark(alice, 'invalid')).code, 400);
  } finally { Notification.find = find; Notification.updateOne = update; }
});

test('database failures return a retryable error without acknowledging an item', async () => {
  const find = Notification.find, update = Notification.updateOne;
  Notification.find = () => { throw new Error('database unavailable'); };
  Notification.updateOne = async () => { throw new Error('database unavailable'); };
  try {
    const unread = response(), read = response();
    await controller.unreadAnnouncements({ user: { _id: '507f1f77bcf86cd799439021' } }, unread);
    await controller.markAnnouncementRead({ user: { _id: '507f1f77bcf86cd799439021' }, params: { id: '507f1f77bcf86cd799439011' } }, read);
    assert.equal(unread.code, 500); assert.equal(read.code, 500);
    assert.match(read.body.error, /retry/);
  } finally { Notification.find = find; Notification.updateOne = update; }
});
