// Atomic shared-lists clerk (Lambda) behind the HTTP API. Two people can share a list: both can add,
// check, edit and delete. Every route needs Authorization: Bearer <Cognito ID token>; API Gateway's JWT
// authorizer checks it first, so the user id (sub) and email come from verified claims.
//
//   GET  /shared?since=<ISO>          -> { memberOf: [listId], lists: [...], items: [...], cursor }
//                                        your shared lists, plus items filed after `since` (every item of a list you just joined)
//   POST /shared/lists                -> upsert one list { id, title, link, updatedAt, deletedAt, displayName }
//                                        first call creates it (you become member 1); later calls rename/delete it (newest wins)
//   POST /shared/lists/{id}/invite    -> { code, expiresAt }   an 8-character code, good for 48 hours, for the 2nd person
//   POST /shared/join                 -> body { code, displayName } -> { list }
//   POST /shared/lists/{id}/leave     -> { ok }   you stop sharing it; the other person keeps it
//   POST /shared/items/batch          -> body { listId, records: [item] } (max 25) -> { saved: [id], stale: [id] }
//
// Table layout (same table as the data clerk, a separate drawer per LIST):
//   LIST#<id> | META        { version, data: { title, titleAt, deletedAt, members: [sub], names: {sub: name}, ... } }
//   LIST#<id> | ITEM#<id>   { updatedAt, syncedAt, data: item }          (one row per item, so two people never overwrite each other)
//   USER#<sub> | SHARED#<id> { listId, joinedAt }                         (which lists you belong to)
//   INVITE#<code> | INVITE  { listId, createdBy, expiresAt }
// The META row is changed with a version check (read, change, write only if nobody else changed it meanwhile),
// items with the same newest-wins rule as the data clerk. Every read and write checks that you are a member.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomInt } from 'node:crypto';

const MAX_MEMBERS = 2;
const MAX_BATCH = 25;
const MAX_ITEM_BYTES = 4 * 1024;
const INVITE_MS = 48 * 3600 * 1000;
const OVERLAP_MS = 30_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L: easy to read out loud
const LIST_ID = /^sl_[A-Za-z0-9-]{8,64}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,100}$/;

class HttpError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
const resp = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const isIso = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const nowIso = () => new Date().toISOString();
const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nameFor = (claims, wanted) => {
  const n = cleanText(wanted, 30);
  if (n) return n;
  const local = cleanText(String(claims.email || '').split('@')[0], 30);
  return local ? local[0].toUpperCase() + local.slice(1) : 'Someone';
};
const cleanLink = s => { const v = String(s ?? '').trim().slice(0, 500); return /^https?:\/\/[^\s/]+\S*$/i.test(v) ? v : ''; };
const view = d => ({
  id: d.id, title: d.title, link: d.link || '', updatedAt: d.titleAt, deletedAt: d.deletedAt, createdAt: d.createdAt, createdBy: d.createdBy,
  members: d.members.map(sub => ({ sub, name: d.names[sub] || 'Someone' })),
});

export function makeHandler(ddb, table) {
  const get = async Key => (await ddb.send(new GetCommand({ TableName: table, Key }))).Item || null;
  const put = (Item, extra = {}) => ddb.send(new PutCommand({ TableName: table, Item, ...extra }));
  const del = Key => ddb.send(new DeleteCommand({ TableName: table, Key }));
  const getMeta = id => get({ pk: `LIST#${id}`, sk: 'META' });
  const isConflict = err => err.name === 'ConditionalCheckFailedException';

  async function queryAll(params) {
    const out = []; let ExclusiveStartKey;
    do {
      const res = await ddb.send(new QueryCommand({ TableName: table, ...params, ExclusiveStartKey }));
      out.push(...(res.Items || [])); ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  // read, change, write only if nobody changed the META row in between (retry a few times)
  async function mutate(id, change) {
    for (let n = 0; n < 4; n++) {
      const cur = await getMeta(id);
      if (!cur) throw new HttpError(404, 'That list does not exist.');
      const data = structuredClone(cur.data);
      change(data);
      try {
        await put({ ...cur, version: cur.version + 1, data }, { ConditionExpression: 'version = :v', ExpressionAttributeValues: { ':v': cur.version } });
        return data;
      } catch (err) { if (!isConflict(err)) throw err; }
    }
    throw new HttpError(409, 'The list was busy. Try again.');
  }
  const pointer = (sub, listId) => put({ pk: `USER#${sub}`, sk: `SHARED#${listId}`, listId, joinedAt: nowIso() });
  async function requireMember(sub, id) {
    if (!LIST_ID.test(id || '')) throw new HttpError(400, 'bad list id');
    const meta = await getMeta(id);
    if (!meta) throw new HttpError(404, 'That list does not exist.');
    if (!meta.data.members.includes(sub)) throw new HttpError(403, 'You are not part of that list.');
    return meta.data;
  }

  async function pull(sub, since) {
    const started = Date.now();
    const pointers = await queryAll({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)', ExpressionAttributeValues: { ':pk': `USER#${sub}`, ':p': 'SHARED#' },
    });
    const lists = [], items = [], memberOf = [];
    await Promise.all(pointers.map(async ptr => {
      const meta = await getMeta(ptr.listId);
      if (!meta || !meta.data.members.includes(sub)) return; // a leftover pointer: ignore
      memberOf.push(ptr.listId); lists.push(view(meta.data));
      const all = !since || ptr.joinedAt > since; // a list you just joined sends every item
      const rows = await queryAll({
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
        ...(all ? {} : { FilterExpression: 'syncedAt > :since' }),
        ExpressionAttributeValues: { ':pk': `LIST#${ptr.listId}`, ':p': 'ITEM#', ...(all ? {} : { ':since': since }) },
      });
      for (const r of rows) items.push(r.data);
    }));
    return { memberOf, lists, items, cursor: new Date(started - OVERLAP_MS).toISOString() };
  }

  async function upsertList(sub, claims, body) {
    const id = body.id;
    if (!LIST_ID.test(id || '')) throw new HttpError(400, 'bad list id');
    const title = cleanText(body.title, 80);
    if (!title) throw new HttpError(400, 'a list needs a title');
    if (!isIso(body.updatedAt)) throw new HttpError(400, 'list needs updatedAt');
    const name = nameFor(claims, body.displayName);
    const deletedAt = isIso(body.deletedAt) ? body.deletedAt : null;
    if (!(await getMeta(id))) {
      const data = { id, title, link: cleanLink(body.link), titleAt: body.updatedAt, deletedAt, createdAt: nowIso(), createdBy: sub, members: [sub], names: { [sub]: name } };
      try {
        await put({ pk: `LIST#${id}`, sk: 'META', version: 1, data }, { ConditionExpression: 'attribute_not_exists(pk)' });
        await pointer(sub, id);
        return view(data);
      } catch (err) { if (!isConflict(err)) throw err; } // someone created it a moment ago: update it below
    }
    const data = await mutate(id, d => {
      if (!d.members.includes(sub)) throw new HttpError(403, 'You are not part of that list.');
      d.names[sub] = name;
      if (body.updatedAt > d.titleAt) { d.title = title; d.link = cleanLink(body.link); d.deletedAt = deletedAt; d.titleAt = body.updatedAt; } // newest wins
    });
    return view(data);
  }

  async function invite(sub, id) {
    const d = await requireMember(sub, id);
    if (d.deletedAt) throw new HttpError(410, 'That list was deleted.');
    if (d.members.length >= MAX_MEMBERS) {
      const other = d.members.find(m => m !== sub);
      throw new HttpError(409, `This list is already shared with ${d.names[other] || 'someone'}.`);
    }
    for (let n = 0; n < 5; n++) {
      const code = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
      const expiresAt = new Date(Date.now() + INVITE_MS).toISOString();
      try {
        await put({ pk: `INVITE#${code}`, sk: 'INVITE', listId: id, createdBy: sub, expiresAt }, { ConditionExpression: 'attribute_not_exists(pk)' });
        return { code, expiresAt };
      } catch (err) { if (!isConflict(err)) throw err; }
    }
    throw new HttpError(500, 'Could not make a code. Try again.');
  }

  async function join(sub, claims, body) {
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const bad = new HttpError(404, "That code isn't valid or has expired.");
    if (code.length !== 8) throw bad;
    const inv = await get({ pk: `INVITE#${code}`, sk: 'INVITE' });
    if (!inv || inv.expiresAt < nowIso()) throw bad;
    const name = nameFor(claims, body.displayName);
    let joinedNew = false;
    const data = await mutate(inv.listId, d => {
      joinedNew = false;
      if (d.deletedAt) throw new HttpError(410, 'That list was deleted.');
      if (d.members.includes(sub)) { d.names[sub] = name; return; }
      if (d.members.length >= MAX_MEMBERS) throw new HttpError(409, 'That list already has two people.');
      d.members.push(sub); d.names[sub] = name; joinedNew = true;
    });
    await pointer(sub, inv.listId);
    if (joinedNew) await del({ pk: `INVITE#${code}`, sk: 'INVITE' }); // a code works once
    return { list: view(data) };
  }

  async function leave(sub, id) {
    if (!LIST_ID.test(id || '')) throw new HttpError(400, 'bad list id');
    const meta = await getMeta(id);
    if (meta?.data.members.includes(sub)) {
      await mutate(id, d => {
        d.members = d.members.filter(m => m !== sub); delete d.names[sub];
        if (!d.members.length) { d.deletedAt = nowIso(); d.titleAt = d.deletedAt; } // the last person left: the list is gone
      });
    }
    await del({ pk: `USER#${sub}`, sk: `SHARED#${id}` });
    return { ok: true };
  }

  async function saveItems(sub, body) {
    const d = await requireMember(sub, body.listId);
    if (d.deletedAt) throw new HttpError(410, 'That list was deleted.');
    const records = Array.isArray(body.records) ? body.records : [];
    if (!records.length) return { saved: [], stale: [] };
    if (records.length > MAX_BATCH) throw new HttpError(400, `at most ${MAX_BATCH} records per batch`);
    const syncedAt = nowIso();
    const results = await Promise.all(records.map(async r => {
      if (!r || !ITEM_ID.test(r.id || '')) throw new HttpError(400, 'item needs an id');
      if (!isIso(r.updatedAt)) throw new HttpError(400, 'item needs updatedAt');
      const rec = { // only known fields are kept
        id: r.id, listId: body.listId, text: cleanText(r.text, 200), done: !!r.done,
        doneBy: r.done ? (d.members.includes(r.doneBy) ? r.doneBy : sub) : null, doneAt: r.done && isIso(r.doneAt) ? r.doneAt : null,
        order: Number.isFinite(r.order) ? r.order : 0, createdBy: d.members.includes(r.createdBy) ? r.createdBy : sub,
        createdAt: isIso(r.createdAt) ? r.createdAt : r.updatedAt, updatedAt: r.updatedAt, deletedAt: isIso(r.deletedAt) ? r.deletedAt : null,
      };
      if (cleanLink(r.link)) rec.link = cleanLink(r.link); // v0.2.7: a link on the item itself

      if (JSON.stringify(rec).length > MAX_ITEM_BYTES) throw new HttpError(413, 'that item is too large');
      try {
        await put({ pk: `LIST#${body.listId}`, sk: `ITEM#${rec.id}`, updatedAt: rec.updatedAt, syncedAt, data: rec },
          { ConditionExpression: 'attribute_not_exists(sk) OR updatedAt < :u', ExpressionAttributeValues: { ':u': rec.updatedAt } });
        return true;
      } catch (err) { if (isConflict(err)) return false; throw err; }
    }));
    const saved = [], stale = [];
    results.forEach((ok, i) => (ok ? saved : stale).push(records[i].id));
    return { saved, stale };
  }

  return async function handler(event) {
    try {
      const claims = event.requestContext?.authorizer?.jwt?.claims || {};
      const sub = claims.sub;
      if (!sub) throw new HttpError(401, 'Missing authenticated subject');
      const method = event.requestContext.http.method;
      const path = event.rawPath;
      const body = () => {
        try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '{}')) || {}; }
        catch { throw new HttpError(400, 'body must be JSON'); }
      };
      if (method === 'GET' && path === '/shared') {
        const since = event.queryStringParameters?.since;
        if (since && !isIso(since)) throw new HttpError(400, 'since must be an ISO date');
        return resp(200, await pull(sub, since || null));
      }
      if (method === 'POST') {
        if (path === '/shared/lists') return resp(200, { list: await upsertList(sub, claims, body()) });
        if (path === '/shared/join') return resp(200, await join(sub, claims, body()));
        if (path === '/shared/items/batch') return resp(200, await saveItems(sub, body()));
        const m = path.match(/^\/shared\/lists\/([^/]+)\/(invite|leave)$/);
        if (m) return resp(200, m[2] === 'invite' ? await invite(sub, m[1]) : await leave(sub, m[1]));
      }
      return resp(404, { error: 'Not found' });
    } catch (err) {
      if (!err.statusCode) console.error(err);
      return resp(err.statusCode || 500, { error: err.statusCode ? err.message : 'Internal error' });
    }
  };
}

let real;
export const handler = event => {
  real ||= makeHandler(DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } }), process.env.TABLE_NAME);
  return real(event);
};
