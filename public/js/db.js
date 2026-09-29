// Atomic — IndexedDB storage ("the filing drawer at your own desk") + sync outbox ("outgoing-mail tray").
// Records are never hard-deleted: deletes set deletedAt so a future cloud sync can pass removals on.

import { nowIso, SCHEMA_VERSION } from './model.js';

const DB_NAME = 'atomic';
const DB_VERSION = 1;
export const STORES = ['elements', 'isotopes', 'atoms', 'logs'];

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const result = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

// Save records (stamps updatedAt unless keepStamp) and queue them in the outbox, in one transaction.
export async function put(store, records, { keepStamp = false } = {}) {
  const list = Array.isArray(records) ? records : [records];
  const db = await open();
  const tx = db.transaction([store, 'outbox'], 'readwrite');
  const t = nowIso();
  for (const r of list) {
    if (!keepStamp) r.updatedAt = t;
    tx.objectStore(store).put(r);
    tx.objectStore('outbox').add({ store, id: r.id, at: r.updatedAt });
  }
  await done(tx);
  return list;
}

// Save records that came FROM the cloud: no new stamp, and not queued to be sent back.
export async function putQuiet(store, records) {
  if (!records.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const r of records) tx.objectStore(store).put(r);
  await done(tx);
}
// Replace a store's whole contents quietly (first sign-in on a fresh device adopts the cloud copy).
export async function replaceQuiet(store, records) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  for (const r of records) tx.objectStore(store).put(r);
  await done(tx);
}

// ---------- outbox ("outgoing-mail tray") ----------
export async function readOutbox() {
  const db = await open();
  return result(db.transaction('outbox').objectStore('outbox').getAll());
}
// remove everything up to and including seq (later changes stay queued)
export async function clearOutbox(uptoSeq) {
  const db = await open();
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').delete(IDBKeyRange.upperBound(uptoSeq));
  await done(tx);
}
export async function emptyOutbox() {
  const db = await open();
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').clear();
  await done(tx);
}
// queue every record on this device (first sign-in, so nothing made before signing in is left behind)
export async function requeueAll() {
  const db = await open();
  const rows = [];
  for (const s of STORES) for (const r of await getAll(s)) rows.push({ store: s, id: r.id, at: r.updatedAt });
  const tx = db.transaction('outbox', 'readwrite');
  for (const row of rows) tx.objectStore('outbox').add(row);
  await done(tx);
}

export async function getMeta(key, fallback = null) {
  const db = await open();
  const row = await result(db.transaction('meta').objectStore('meta').get(key));
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await done(tx);
}

export async function outboxCount() {
  const db = await open();
  return result(db.transaction('outbox').objectStore('outbox').count());
}

export async function exportAll() {
  const out = { app: 'atomic', schemaVersion: SCHEMA_VERSION, exportedAt: nowIso() };
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}

export async function wipe() {
  const db = await open();
  const all = [...STORES, 'meta', 'outbox'];
  const tx = db.transaction(all, 'readwrite');
  for (const s of all) tx.objectStore(s).clear();
  await done(tx);
}
