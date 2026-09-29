// Unit tests for the data clerk (backend/src/data/data.js) against an in-memory table.
import assert from 'node:assert/strict';
import { makeHandler } from '../backend/src/data/data.js';
import { fakeDdb } from './fake-ddb.mjs';

const ddb = fakeDdb();
const h = makeHandler(ddb, 'AtomicTable');
const ev = (sub, method, path, body, qs) => ({
  rawPath: path, queryStringParameters: qs, body: body && JSON.stringify(body),
  requestContext: { http: { method }, ...(sub ? { authorizer: { jwt: { claims: { sub } } } } : {}) },
});
const call = async (...a) => { const r = await h(ev(...a)); return { status: r.statusCode, body: JSON.parse(r.body) }; };

let r = await call(null, 'GET', '/data'); assert.equal(r.status, 401);
r = await call('u1', 'GET', '/data'); assert.equal(r.status, 200); assert.deepEqual(r.body.items.atoms, []);

const a1 = { id: 'atom_1', title: 'run', updatedAt: '2026-09-29T10:00:00.000Z' };
r = await call('u1', 'POST', '/data/batch', { records: [{ store: 'atoms', record: a1 }, { store: 'elements', record: { id: 'el_1', name: 'Fitness', updatedAt: '2026-09-29T10:00:00.000Z' } }] });
assert.deepEqual(r.body, { saved: ['atom_1', 'el_1'], stale: [] });
// older version loses, newer wins
r = await call('u1', 'POST', '/data/batch', { records: [{ store: 'atoms', record: { ...a1, title: 'old', updatedAt: '2026-09-29T09:00:00.000Z' } }] });
assert.deepEqual(r.body.stale, ['atom_1']);
r = await call('u1', 'POST', '/data/batch', { records: [{ store: 'atoms', record: { ...a1, title: 'run 5k', updatedAt: '2026-09-29T11:00:00.000Z' } }] });
assert.deepEqual(r.body.saved, ['atom_1']);
r = await call('u1', 'GET', '/data'); assert.equal(r.body.items.atoms[0].title, 'run 5k'); assert.equal(r.body.items.elements.length, 1);
// users never see each other's drawer
r = await call('u2', 'GET', '/data'); assert.equal(r.body.items.atoms.length, 0);
// since: only rows received after the cursor
const cursor = new Date(Date.now() + 60_000).toISOString();
r = await call('u1', 'GET', '/data', null, { since: cursor }); assert.equal(r.body.items.atoms.length, 0);
assert.ok(r.body.cursor);
// validation
r = await call('u1', 'POST', '/data/batch', { records: [{ store: 'secrets', record: a1 }] }); assert.equal(r.status, 400);
r = await call('u1', 'POST', '/data/batch', { records: [{ store: 'atoms', record: { id: 'x' } }] }); assert.equal(r.status, 400);
r = await call('u1', 'POST', '/data/batch', { records: Array.from({ length: 26 }, (_, i) => ({ store: 'atoms', record: { ...a1, id: 'a' + i } })) }); assert.equal(r.status, 400);
r = await call('u1', 'GET', '/data', null, { since: 'yesterday' }); assert.equal(r.status, 400);
r = await call('u1', 'DELETE', '/data'); assert.equal(r.status, 404);
console.log('backend tests passed');
