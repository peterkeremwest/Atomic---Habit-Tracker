// Atomic data clerk (Lambda) behind the HTTP API. Every route needs Authorization: Bearer <Cognito ID token>;
// API Gateway's JWT authorizer checks it before this code runs, so the user id (sub) comes from verified claims.
//
//   GET  /data?since=<ISO>   -> { items: { elements, isotopes, atoms, logs }, cursor }
//                               everything the cloud received after `since` (everything when omitted)
//   POST /data/batch         -> body { records: [{ store, record }] } (max 25)
//                               -> { saved: [id], stale: [id] }
//
// Table layout (one drawer per user): pk = USER#<sub>, sk = ELEMENT#id | ISOTOPE#id | ATOM#id | LOG#id
// Each row: { pk, sk, store, updatedAt, syncedAt, data }. Deletes are soft (data.deletedAt), so there is no DELETE route.
// Writes are conditional, newest-wins: a record is only replaced by one with a later updatedAt.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const PREFIX = { elements: 'ELEMENT', isotopes: 'ISOTOPE', atoms: 'ATOM', logs: 'LOG' };
const STORE_OF = Object.fromEntries(Object.entries(PREFIX).map(([s, p]) => [p, s]));
const MAX_BATCH = 25;
const MAX_RECORD_BYTES = 32 * 1024;
const OVERLAP_MS = 30_000; // pull cursors overlap a little so a write landing mid-query is never missed (merges are idempotent)

class HttpError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
const resp = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const isIso = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));

export function makeHandler(ddb, table) {
  async function pull(pk, since) {
    const items = { elements: [], isotopes: [], atoms: [], logs: [] };
    const started = Date.now();
    let ExclusiveStartKey;
    do {
      const res = await ddb.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'pk = :pk',
        ...(since ? { FilterExpression: 'syncedAt > :since', ExpressionAttributeValues: { ':pk': pk, ':since': since } }
          : { ExpressionAttributeValues: { ':pk': pk } }),
        ExclusiveStartKey,
      }));
      for (const it of res.Items || []) {
        const store = STORE_OF[it.sk.split('#')[0]];
        if (store) items[store].push(it.data);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return { items, cursor: new Date(started - OVERLAP_MS).toISOString() };
  }

  async function saveOne(pk, store, record, syncedAt) {
    if (!PREFIX[store]) throw new HttpError(400, `unknown store ${store}`);
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 200) throw new HttpError(400, 'record needs an id');
    if (!isIso(record.updatedAt)) throw new HttpError(400, 'record needs updatedAt');
    if (JSON.stringify(record).length > MAX_RECORD_BYTES) throw new HttpError(413, `record ${record.id} is too large`);
    try {
      await ddb.send(new PutCommand({
        TableName: table,
        Item: { pk, sk: `${PREFIX[store]}#${record.id}`, store, updatedAt: record.updatedAt, syncedAt, data: record },
        // newest wins: only write if the cabinet has nothing yet, or holds an older version
        ConditionExpression: 'attribute_not_exists(sk) OR updatedAt < :u',
        ExpressionAttributeValues: { ':u': record.updatedAt },
      }));
      return true;
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }

  return async function handler(event) {
    try {
      const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
      if (!sub) throw new HttpError(401, 'Missing authenticated subject');
      const pk = `USER#${sub}`;
      const method = event.requestContext.http.method;
      const path = event.rawPath;

      if (method === 'GET' && path === '/data') {
        const since = event.queryStringParameters?.since;
        if (since && !isIso(since)) throw new HttpError(400, 'since must be an ISO date');
        return resp(200, await pull(pk, since || null));
      }
      if (method === 'POST' && path === '/data/batch') {
        let body;
        try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '{}')); }
        catch { throw new HttpError(400, 'body must be JSON'); }
        const records = Array.isArray(body.records) ? body.records : [];
        if (!records.length) return resp(200, { saved: [], stale: [] });
        if (records.length > MAX_BATCH) throw new HttpError(400, `at most ${MAX_BATCH} records per batch`);
        const syncedAt = new Date().toISOString();
        const results = await Promise.all(records.map(r => saveOne(pk, r.store, r.record, syncedAt)));
        const saved = [], stale = [];
        results.forEach((ok, i) => (ok ? saved : stale).push(records[i].record.id));
        return resp(200, { saved, stale });
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
