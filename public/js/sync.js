// Cloud sync ("copying pages between your notebook and the filing cabinet").
// This device stays the source of truth: every change is saved locally first and queued in the outbox.
// When signed in and online, the outbox is sent to the back office in batches, then anything newer
// from other devices is pulled down. Both sides keep the newest version of each record (updatedAt).
import { CLOUD, cloudReady } from './config.js';
import * as auth from './auth.js';
import * as db from './db.js';
import * as A from './state.js';
import * as Shared from './shared.js';

const { S } = A;
const BATCH = 25;
let timer = null, running = false, again = false;

// status changes only repaint SETTINGS (re-rendering Today mid-typing would eat what you type)
const statusHooks = new Set();
export const onStatus = fn => statusHooks.add(fn);
const set = patch => { Object.assign(S.sync, patch); statusHooks.forEach(fn => fn()); };

export async function api(method, path, body, retry = true) {
  const token = await auth.idToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(CLOUD.apiUrl.replace(/\/$/, '') + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry) { await auth.idToken(); return api(method, path, body, false); }
  if (!res.ok) {
    const said = await res.json().catch(() => null);
    const err = new Error(said?.error || `the back office answered ${res.status}`);
    err.status = res.status;
    err.fromClerk = !!said?.error; // a clerk answered (as opposed to the front desk saying "no such route")
    throw err;
  }
  return res.json();
}

async function push() {
  const box = await db.readOutbox();
  if (!box.length) return 0;
  const maxSeq = Math.max(...box.map(b => b.seq));
  const keys = [...new Map(box.map(b => [b.store + '|' + b.id, b])).values()]; // each record once
  const records = keys.map(({ store, id }) => ({ store, record: S[store]?.find(r => r.id === id) })).filter(r => r.record);
  const normal = records.filter(r => db.STORES.includes(r.store));
  for (let i = 0; i < normal.length; i += BATCH) await api('POST', '/data/batch', { records: normal.slice(i, i + BATCH) });
  await pushShared(records.filter(r => r.store === 'slists').map(r => r.record), records.filter(r => r.store === 'sitems').map(r => r.record));
  await db.clearOutbox(maxSeq);
  return records.length;
}

// Shared lists go through their own clerk: the list first (so the cloud knows it), then its items.
// If the cloud says you're no longer in a list (403/404/410 from the clerk), that list's changes are dropped.
const GONE = [403, 404, 410];
async function pushShared(lists, items) {
  const dead = new Set();
  for (const l of lists) {
    try { await api('POST', '/shared/lists', { id: l.id, title: l.title, updatedAt: l.updatedAt, deletedAt: l.deletedAt, link: l.link || '', displayName: S.settings.sharedName || '' }); }
    catch (err) { if (err.fromClerk && GONE.includes(err.status)) dead.add(l.id); else throw err; }
  }
  const byList = new Map();
  for (const it of items) if (!dead.has(it.listId)) byList.set(it.listId, [...(byList.get(it.listId) || []), it]);
  for (const [listId, recs] of byList) {
    for (let i = 0; i < recs.length; i += BATCH) {
      try { await api('POST', '/shared/items/batch', { listId, records: recs.slice(i, i + BATCH) }); }
      catch (err) { if (err.fromClerk && GONE.includes(err.status)) break; throw err; }
    }
  }
}
async function pullShared() {
  const since = await db.getMeta('sharedCursor', null);
  let res;
  try { res = await api('GET', '/shared' + (since ? '?since=' + encodeURIComponent(since) : '')); }
  catch (err) { if (err.status === 404 && !err.fromClerk) return 0; throw err; } // back office not updated for shared lists yet
  const n = await Shared.applyRemote(res);
  await db.setMeta('sharedCursor', res.cursor);
  return n;
}

// ----- things you do on purpose with shared lists (these need the internet) -----
const needOnline = () => { if (!navigator.onLine) throw new Error('you need to be online for this'); };
export async function inviteCode(listId) {
  needOnline();
  await push(); // the cloud must know the list exists before it can invite anyone
  return api('POST', `/shared/lists/${encodeURIComponent(listId)}/invite`, {});
}
export async function joinWithCode(code) {
  needOnline();
  const res = await api('POST', '/shared/join', { code, displayName: S.settings.sharedName || '' });
  await pullShared(); // brings every item of the list you just joined
  return res.list;
}
export async function leaveList(listId) {
  needOnline();
  await push();
  await api('POST', `/shared/lists/${encodeURIComponent(listId)}/leave`, {});
  await Shared.dropLists([listId]);
}

async function pull() {
  const since = await db.getMeta('syncCursor', null);
  const res = await api('GET', '/data' + (since ? '?since=' + encodeURIComponent(since) : ''));
  const n = await A.applyRemote(res.items);
  await db.setMeta('syncCursor', res.cursor);
  return n + await pullShared();
}

export async function syncNow() {
  if (!cloudReady() || !auth.signedIn()) { set({ state: 'off' }); return; }
  if (!navigator.onLine) { set({ state: 'offline' }); return; }
  if (running) { again = true; return; }
  running = true; set({ state: 'syncing' });
  try {
    await push();
    await pull();
    await A.refreshPendingCount();
    set({ state: 'idle', lastAt: Date.now(), error: null });
  } catch (err) {
    console.warn('cloud sync failed; everything is still saved on this device', err);
    set({ state: auth.signedIn() ? 'error' : 'off', error: err.message || String(err) });
  } finally {
    running = false;
    if (again) { again = false; schedule(); }
  }
}

export function schedule(ms = 1500) {
  if (!cloudReady() || !auth.signedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

// Right after signing in. A device with nothing of its own (just the starter categories) takes the
// cloud copy as-is, so a new phone doesn't add duplicate starter categories. Otherwise everything
// on this device is queued and merged with the cloud, newest version of each record winning.
export async function afterSignIn() {
  set({ state: 'syncing' });
  await db.setMeta('syncCursor', null);
  await db.setMeta('sharedCursor', null);
  const res = await api('GET', '/data');
  const cloudHas = Object.values(res.items).some(list => list.length);
  if (cloudHas && !A.hasOwnData()) await A.replaceAll(res.items);
  else { await db.requeueAll(); await A.applyRemote(res.items); }
  await db.setMeta('syncCursor', res.cursor);
  await syncNow();
  return cloudHas;
}

// Sign out: send anything still waiting, then clear this device so the next person starts empty (Forge lesson).
// If some changes can't be sent (offline, back office down), returns { left } without signing out unless force.
export async function signOutAndClear(force = false) {
  if (!force) {
    try { if (navigator.onLine) await push(); } catch { /* counted below */ }
    const left = (await db.readOutbox()).length;
    if (left) return { left };
  }
  clearTimeout(timer);
  await auth.signOut();
  await A.resetAll({ keepSettings: true });
  set({ state: 'off', lastAt: null, error: null });
  return { left: 0 };
}

export async function start() {
  await auth.loadAuth();
  A.onSaved(() => schedule());
  window.addEventListener('online', () => schedule(200));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 5 * 60_000);
  if (auth.signedIn()) schedule(300); else set({ state: 'off' });
}
