// Unit tests for the shared-lists clerk (backend/src/shared/shared.js) against an in-memory table.
import assert from 'node:assert/strict';
import { makeHandler } from '../backend/src/shared/shared.js';
import { fakeDdb } from './fake-ddb.mjs';

const ddb = fakeDdb();
const h = makeHandler(ddb, 'AtomicTable');
const USERS = { alice: { sub: 'sub-a', email: 'alice@example.com' }, bob: { sub: 'sub-b', email: 'bob@example.com' }, carol: { sub: 'sub-c', email: 'carol@example.com' } };
const call = async (who, method, path, body, qs) => {
  const r = await h({ rawPath: path, queryStringParameters: qs, body: body && JSON.stringify(body),
    requestContext: { http: { method }, ...(who ? { authorizer: { jwt: { claims: USERS[who] } } } : {}) } });
  return { status: r.statusCode, body: JSON.parse(r.body) };
};
const T = n => `2026-10-14T10:00:${String(n).padStart(2, '0')}.000Z`;
const LIST = 'sl_11111111-aaaa';
const item = (id, text, n, extra = {}) => ({ id, listId: LIST, text, done: false, order: n, createdBy: 'sub-a', createdAt: T(n), updatedAt: T(n), deletedAt: null, ...extra });

let r = await call(null, 'GET', '/shared'); assert.equal(r.status, 401);
r = await call('alice', 'GET', '/shared'); assert.equal(r.status, 200); assert.deepEqual(r.body.lists, []);

// ---- create: Alice becomes the first member, named from her email ----
r = await call('alice', 'POST', '/shared/lists', { id: LIST, title: 'Errands', updatedAt: T(1) });
assert.equal(r.status, 200); assert.deepEqual(r.body.list.members, [{ sub: 'sub-a', name: 'Alice' }]);
r = await call('alice', 'POST', '/shared/lists', { id: 'nope', title: 'x', updatedAt: T(1) }); assert.equal(r.status, 400);
r = await call('alice', 'POST', '/shared/lists', { id: 'sl_22222222-bbbb', title: '  ', updatedAt: T(1) }); assert.equal(r.status, 400);
// strangers cannot touch it
r = await call('bob', 'POST', '/shared/lists', { id: LIST, title: 'Hijack', updatedAt: T(50) }); assert.equal(r.status, 403);
r = await call('bob', 'POST', '/shared/items/batch', { listId: LIST, records: [item('si_x', 'sneaky', 2)] }); assert.equal(r.status, 403);
r = await call('bob', 'POST', `/shared/lists/${LIST}/invite`); assert.equal(r.status, 403);
r = await call('bob', 'GET', '/shared'); assert.deepEqual(r.body.lists, []);

// ---- items: newest wins, only known fields kept ----
r = await call('alice', 'POST', '/shared/items/batch', { listId: LIST, records: [item('si_1', 'eggs', 2), item('si_2', 'soap', 3, { evil: '<script>' })] });
assert.deepEqual(r.body, { saved: ['si_1', 'si_2'], stale: [] });
r = await call('alice', 'POST', '/shared/items/batch', { listId: LIST, records: [item('si_1', 'old eggs', 1)] });
assert.deepEqual(r.body.stale, ['si_1']);
r = await call('alice', 'GET', '/shared');
assert.equal(r.body.items.length, 2); assert.ok(!('evil' in r.body.items.find(i => i.id === 'si_2')));
assert.deepEqual(r.body.memberOf, [LIST]);
const cursorBeforeBob = r.body.cursor;
r = await call('alice', 'POST', '/shared/items/batch', { listId: LIST, records: Array.from({ length: 26 }, (_, i) => item('si_b' + i, 'x', 5)) }); assert.equal(r.status, 400);
r = await call('alice', 'POST', '/shared/items/batch', { listId: LIST, records: [{ ...item('si_9', 'x', 5), updatedAt: 'later' }] }); assert.equal(r.status, 400);

// ---- invite and join ----
r = await call('alice', 'POST', `/shared/lists/${LIST}/invite`); assert.equal(r.status, 200);
const { code } = r.body; assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
r = await call('bob', 'POST', '/shared/join', { code: 'WRONG123' }); assert.equal(r.status, 404);
r = await call('bob', 'POST', '/shared/join', { code: code.toLowerCase().replace(/(....)/, '$1-'), displayName: 'Bobby' });
assert.equal(r.status, 200); assert.deepEqual(r.body.list.members.map(m => m.name), ['Alice', 'Bobby']);
// the code worked once; the list is full
r = await call('carol', 'POST', '/shared/join', { code }); assert.equal(r.status, 404);
r = await call('alice', 'POST', `/shared/lists/${LIST}/invite`); assert.equal(r.status, 409); assert.match(r.body.error, /Bobby/);
// Bob gets every old item even though his cursor is newer than when they were filed
for (const row of ddb.rows.values()) if (row.sk.startsWith('ITEM#')) row.syncedAt = '2020-01-01T00:00:00.000Z';
r = await call('bob', 'GET', '/shared', null, { since: '2021-01-01T00:00:00.000Z' });
assert.equal(r.body.items.length, 2); assert.equal(r.body.lists[0].title, 'Errands');
// ...but a later pull only sends what changed
r = await call('bob', 'GET', '/shared', null, { since: new Date(Date.now() + 60_000).toISOString() });
assert.equal(r.body.items.length, 0); assert.equal(r.body.lists.length, 1);

// ---- both can change things; who completed it is kept ----
r = await call('bob', 'POST', '/shared/items/batch', { listId: LIST, records: [item('si_1', 'eggs', 10, { done: true, doneBy: 'sub-b', doneAt: T(10) }), item('si_3', 'milk', 11, { createdBy: 'sub-b' })] });
assert.deepEqual(r.body.saved, ['si_1', 'si_3']);
r = await call('alice', 'GET', '/shared', null, { since: cursorBeforeBob });
const eggs = r.body.items.find(i => i.id === 'si_1'); assert.equal(eggs.done, true); assert.equal(eggs.doneBy, 'sub-b');
// nobody can credit a check-off to a stranger
r = await call('alice', 'POST', '/shared/items/batch', { listId: LIST, records: [item('si_2', 'soap', 20, { done: true, doneBy: 'sub-c', doneAt: T(20) })] });
r = await call('alice', 'GET', '/shared'); assert.equal(r.body.items.find(i => i.id === 'si_2').doneBy, 'sub-a');
// rename: newest wins, either person
r = await call('bob', 'POST', '/shared/lists', { id: LIST, title: 'Weekend errands', updatedAt: T(30), displayName: 'Bobby' });
assert.equal(r.body.list.title, 'Weekend errands');
r = await call('alice', 'POST', '/shared/lists', { id: LIST, title: 'Stale title', updatedAt: T(5) });
assert.equal(r.body.list.title, 'Weekend errands');

// ---- expired codes ----
r = await call('alice', 'POST', '/shared/lists', { id: 'sl_33333333-cccc', title: 'Trip', updatedAt: T(1) });
r = await call('alice', 'POST', '/shared/lists/sl_33333333-cccc/invite');
ddb.rows.get(`INVITE#${r.body.code}|INVITE`).expiresAt = '2020-01-01T00:00:00.000Z';
r = await call('carol', 'POST', '/shared/join', { code: r.body.code }); assert.equal(r.status, 404);

// ---- leaving ----
r = await call('bob', 'POST', `/shared/lists/${LIST}/leave`); assert.deepEqual(r.body, { ok: true });
r = await call('bob', 'GET', '/shared'); assert.deepEqual(r.body.memberOf, []);
r = await call('bob', 'POST', '/shared/items/batch', { listId: LIST, records: [item('si_4', 'late', 40)] }); assert.equal(r.status, 403);
r = await call('alice', 'GET', '/shared'); const mine = r.body.lists.find(l => l.id === LIST);
assert.deepEqual(mine.members.map(m => m.name), ['Alice']); assert.equal(r.body.items.length, 3);
// she can invite someone new into the free seat
r = await call('alice', 'POST', `/shared/lists/${LIST}/invite`); assert.equal(r.status, 200);
r = await call('carol', 'POST', '/shared/join', { code: r.body.code }); assert.equal(r.status, 200);
r = await call('alice', 'POST', `/shared/lists/${LIST}/leave`); r = await call('carol', 'POST', `/shared/lists/${LIST}/leave`);
assert.ok(ddb.rows.get(`LIST#${LIST}|META`).data.deletedAt, 'when the last person leaves the list is deleted');
r = await call('alice', 'DELETE', '/shared'); assert.equal(r.status, 404);
// ---- a list's own link: stored with the list, so both people see it; only http(s) is kept ----
r = await call('alice', 'POST', '/shared/lists', { id: 'sl_44444444-dddd', title: 'Groceries', updatedAt: T(1), link: 'https://store.com/list/9' });
assert.equal(r.body.list.link, 'https://store.com/list/9');
r = await call('alice', 'POST', `/shared/lists/sl_44444444-dddd/invite`); r = await call('bob', 'POST', '/shared/join', { code: r.body.code });
assert.equal(r.body.list.link, 'https://store.com/list/9', 'the second person gets the link too');
r = await call('bob', 'POST', '/shared/lists', { id: 'sl_44444444-dddd', title: 'Groceries', updatedAt: T(9), link: 'javascript:alert(1)' });
assert.equal(r.body.list.link, '', 'anything but http(s) is dropped');
r = await call('bob', 'POST', '/shared/lists', { id: 'sl_44444444-dddd', title: 'Groceries', updatedAt: T(10), link: 'https://other.com/x' });
r = await call('alice', 'POST', '/shared/lists', { id: 'sl_44444444-dddd', title: 'Groceries', updatedAt: T(2), link: 'https://stale.com' });
assert.equal(r.body.list.link, 'https://other.com/x', 'newest change wins');
r = await call('alice', 'GET', '/shared'); assert.equal(r.body.lists.find(l => l.id === 'sl_44444444-dddd').link, 'https://other.com/x');
console.log('shared-list backend tests passed');
