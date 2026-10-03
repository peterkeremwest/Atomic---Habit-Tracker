// Atomic — in-memory app state + every action that changes data.
// Screens read from S and call these actions; each action saves to IndexedDB, then re-renders.

import * as db from './db.js';
import * as M from './model.js';

export const S = {
  elements: [], isotopes: [], atoms: [], logs: [],
  settings: { theme: 'green', scanlines: true },
  ui: { folded: new Set(), route: 'today', date: M.todayKey(), calMonth: M.todayKey().slice(0, 7), filterEl: null, lowOnly: false, openEl: null },
  pending: 0,
  timers: {}, // atomId -> { date, remaining (ms), endsAt (ms) | null }
  sync: { state: 'off', lastAt: null, error: null }, // cloud sync status, shown in SETTINGS
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
export const emit = () => listeners.forEach(fn => fn());
// called after any local change is saved (cloud sync listens here to send it)
const savedHooks = new Set();
export const onSaved = fn => savedHooks.add(fn);
const saved = () => savedHooks.forEach(fn => fn());

let logIndex = new Map(); // atomId -> Map<date, log>
function reindex() {
  logIndex = new Map();
  for (const l of S.logs) {
    if (l.deletedAt) continue;
    if (!logIndex.has(l.atomId)) logIndex.set(l.atomId, new Map());
    logIndex.get(l.atomId).set(l.date, l);
  }
}
export const logsFor = atomId => logIndex.get(atomId) || new Map();

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export const live = list => list.filter(r => !r.deletedAt).sort(byOrder);
export const elementById = id => S.elements.find(e => e.id === id);
export const isotopeById = id => S.isotopes.find(i => i.id === id);
export const isotopesOf = elId => live(S.isotopes).filter(i => i.elementId === elId);

async function refreshPending() { S.pending = await db.outboxCount(); }

export async function load() {
  for (const s of db.STORES) S[s] = await db.getAll(s);
  if (!S.elements.length && !(await db.getMeta('seeded'))) {
    const { elements, isotopes } = M.seedRecords();
    await db.put('elements', elements);
    await db.put('isotopes', isotopes);
    S.elements = elements; S.isotopes = isotopes;
    await db.setMeta('seeded', true);
  }
  S.settings = { ...S.settings, ...(await db.getMeta('settings', {})) };
  S.ui.folded = new Set(await db.getMeta('folded', []));
  S.timers = await db.getMeta('timers', {});
  await dedupe();
  reindex();
  await refreshPending();
}

// ---------- no duplicate categories ----------
// Merges categories (and subcategories) that share a name: items move to the one kept, the copies are
// removed (soft delete, so the cloud and other devices get the fix too). Runs on start and after every sync.
export async function dedupe() {
  const plan = M.planDedupe(S.elements, S.isotopes, S.atoms);
  let n = 0;
  for (const store of ['elements', 'isotopes', 'atoms']) {
    const recs = plan[store];
    if (!recs.length) continue;
    await db.put(store, recs);
    for (const r of recs) { const i = S[store].findIndex(x => x.id === r.id); if (i >= 0) S[store][i] = r; else S[store].push(r); }
    n += recs.length;
  }
  if (n) { if (S.ui.filterEl && S.elements.find(e => e.id === S.ui.filterEl)?.deletedAt) S.ui.filterEl = null; await refreshPending(); saved(); }
  return n;
}

// ---------- undo: record the previous version of everything an action touches ----------
let undoRec = null, lastUndo = null;
export async function undoable(label, fn) {
  undoRec = new Map();
  let result;
  try { result = await fn(); } finally {
    const snap = undoRec; undoRec = null;
    lastUndo = snap.size ? { label, snap } : null;
  }
  return result;
}
export const canUndo = () => !!lastUndo;
export async function undo() {
  const u = lastUndo; lastUndo = null;
  if (!u) return false;
  for (const { store, id, prev } of u.snap.values()) {
    const cur = S[store].find(r => r.id === id);
    if (prev) await save(store, { ...prev });
    else if (cur) await save(store, { ...cur, deletedAt: M.nowIso() });
  }
  return true;
}

async function save(store, rec) {
  if (undoRec) {
    const key = store + '|' + rec.id;
    if (!undoRec.has(key)) { const prev = S[store].find(r => r.id === rec.id); undoRec.set(key, { store, id: rec.id, prev: prev ? { ...prev } : null }); }
  }
  await db.put(store, rec);
  const list = S[store];
  const i = list.findIndex(r => r.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  if (store === 'logs') reindex();
  await refreshPending();
  emit(); saved();
  return rec;
}

// ---------- atoms ----------
export async function addAtom(fields) {
  if (!fields.title || !fields.title.trim()) return null;
  return save('atoms', M.makeAtom(fields));
}
export async function updateAtom(id, patch) {
  const a = S.atoms.find(x => x.id === id);
  if (!a) return;
  return save('atoms', { ...a, ...patch });
}
export const deleteAtom = id => updateAtom(id, { deletedAt: M.nowIso() });

// ---------- day logs (one record per atom per day; the id is deterministic so two devices merge cleanly) ----------
async function setLog(atomId, date, patch) {
  const id = M.logId(atomId, date);
  const cur = S.logs.find(l => l.id === id);
  const base = cur || { ...M.newRecord('log', { atomId, date, status: null, count: 0 }), id };
  return save('logs', { ...base, ...patch, deletedAt: null });
}

export async function toggle(atomId, date = M.todayKey()) {
  const a = S.atoms.find(x => x.id === atomId);
  if (!a) return;
  if (a.kind === 'list') {
    const allDone = a.items.length && a.items.every(i => i.done);
    const items = a.items.map(i => ({ ...i, done: !allDone }));
    return updateAtom(atomId, { items, completedOn: !allDone && items.length ? date : null });
  }
  if (a.kind === 'block' || a.kind === 'note') return;
  if (a.kind === 'expense') { // the checkbox marks the whole expense list as paid
    const today = M.todayKey();
    return updateAtom(atomId, { completedOn: a.completedOn ? null : (date > today ? today : date) });
  }
  if (a.kind === 'task') {
    const doneNow = !a.completedOn;
    if (date > M.todayKey()) date = M.todayKey(); // finishing a future task early counts as done today
    await updateAtom(atomId, { completedOn: doneNow ? date : null });
    return setLog(atomId, a.completedOn || date, { status: doneNow ? 'done' : null });
  }
  if (a.target?.kind === 'count') return bump(atomId, date, +1);
  const cur = logsFor(atomId).get(date)?.status;
  return setLog(atomId, date, { status: cur === 'done' ? null : 'done' });
}

export async function bump(atomId, date, delta) {
  const a = S.atoms.find(x => x.id === atomId);
  const goal = a.target?.goal || 1;
  const cur = logsFor(atomId).get(date)?.count || 0;
  const count = Math.max(0, cur + delta);
  return setLog(atomId, date, { count, status: M.statusFromCount(count, goal) });
}

export const setStatus = (atomId, date, status) =>
  setLog(atomId, date, status === null ? { status: null, count: 0 } : { status });

export async function snooze(atomId) {
  return updateAtom(atomId, { dueDate: M.addDays(M.todayKey(), 1), ongoing: false });
}
// move a task to any day picked on the calendar (a focus pin for another day doesn't follow it)
export async function moveTo(atomId, date) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return;
  return updateAtom(atomId, { dueDate: date, ongoing: false, focusOn: a.focusOn === date ? a.focusOn : null });
}

// unfinished one-time tasks showing on `date` -> the next day
export function leftovers(date) {
  return live(S.atoms).filter(a => a.kind === 'task' && !a.ongoing && !a.completedOn && (!a.dueDate || a.dueDate <= date));
}
export async function moveLeftovers(date) {
  const list = leftovers(date);
  for (const a of list) await updateAtom(a.id, { dueDate: M.addDays(date, 1), focusOn: null });
  return list.length;
}

// ---------- focus (up to 3 pinned items per day) ----------
export const focusCount = date => live(S.atoms).filter(a => a.focusOn === date).length;
export async function toggleFocus(atomId, date) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return null;
  if (a.focusOn === date) { await updateAtom(atomId, { focusOn: null }); return 'unpinned'; }
  if (focusCount(date) >= 3) return 'full';
  await updateAtom(atomId, { focusOn: date });
  return 'pinned';
}

// ---------- manual order (drag to reorder inside a section) ----------
export async function reorder(ids) {
  const changed = [];
  ids.forEach((id, i) => {
    const a = S.atoms.find(x => x.id === id);
    if (a && a.order !== i) { const n = { ...a, order: i }; changed.push(n); }
  });
  if (!changed.length) return;
  await db.put('atoms', changed);
  for (const n of changed) S.atoms[S.atoms.findIndex(x => x.id === n.id)] = n;
  await refreshPending(); emit(); saved();
}

// ---------- timers (timer habits: tap to start/pause; done when it reaches zero) ----------
const saveTimers = () => db.setMeta('timers', S.timers);
export function timerLeft(atomId) {
  const t = S.timers[atomId];
  if (!t) return null;
  return t.endsAt ? Math.max(0, t.endsAt - Date.now()) : t.remaining;
}
export const timerRunning = atomId => !!S.timers[atomId]?.endsAt;
export async function timerToggle(atomId, date) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return;
  const t = S.timers[atomId];
  if (!t || t.date !== date) S.timers[atomId] = { date, remaining: a.target.minutes * 60000, endsAt: Date.now() + a.target.minutes * 60000 };
  else if (t.endsAt) S.timers[atomId] = { ...t, remaining: Math.max(0, t.endsAt - Date.now()), endsAt: null };
  else S.timers[atomId] = { ...t, endsAt: Date.now() + t.remaining };
  await saveTimers(); emit();
}
export async function timerReset(atomId) { delete S.timers[atomId]; await saveTimers(); emit(); }
// finish any timers that ran out (also catches ones that ended while the app was closed)
export async function timerSweep() {
  const finished = [];
  for (const [id, t] of Object.entries(S.timers)) {
    if (t.endsAt && t.endsAt <= Date.now()) {
      delete S.timers[id];
      const a = S.atoms.find(x => x.id === id);
      if (a && !a.deletedAt) { await setLog(id, t.date, { status: 'done' }); finished.push(a.title); }
    }
  }
  if (finished.length) await saveTimers();
  return finished;
}

// ---------- lists ----------
export async function toggleListItem(atomId, itemId) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return;
  const items = a.items.map(i => (i.id === itemId ? { ...i, done: !i.done } : i));
  if (a.kind === 'note') return updateAtom(atomId, { items }); // notes never "finish"
  const all = items.length && items.every(i => i.done);
  return updateAtom(atomId, { items, completedOn: all ? (a.completedOn || M.todayKey()) : null });
}
export async function addListItems(atomId, texts) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return;
  const add = texts.map(t => t.trim()).filter(Boolean).map(text => ({ id: M.uid('li'), text, done: false }));
  if (!add.length) return;
  return updateAtom(atomId, { items: [...a.items, ...add], completedOn: null });
}
export async function removeListItem(atomId, itemId) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return;
  const items = a.items.filter(i => i.id !== itemId);
  const all = items.length && items.every(i => i.done);
  return updateAtom(atomId, { items, completedOn: all ? (a.completedOn || M.todayKey()) : null });
}

// ---------- expense lists ----------
export async function addCosts(atomId, costs) {
  const a = S.atoms.find(x => x.id === atomId); if (!a) return;
  const add = costs.filter(c => c.text).map(c => ({ id: M.uid('li'), text: c.text, cents: c.cents || 0 }));
  if (!add.length) return;
  return updateAtom(atomId, { items: [...a.items, ...add] });
}

// ---------- quick add (handles new categories, lists that already exist, several time blocks) ----------
export async function addParsed(parsedList) {
  const made = [];
  for (const p of parsedList) {
    const f = { ...p };
    if (f.newCategory) {
      const existing = M.findCategory(f.newCategory, S.elements);
      f.elementId = existing ? existing.id : (await addCategory(f.newCategory)).id;
    }
    if (f.newSub && f.elementId) {
      const iso = isotopesOf(f.elementId).find(i => i.name.toLowerCase() === f.newSub.toLowerCase());
      f.isotopeId = iso ? iso.id : (await addIsotope(f.elementId, f.newSub.charAt(0).toUpperCase() + f.newSub.slice(1))).id;
    }
    delete f.newCategory; delete f.newSub;
    if (f.kind === 'list') {
      const open = live(S.atoms).find(a => a.kind === 'list' && !a.completedOn && a.title.toLowerCase() === f.title.toLowerCase());
      if (open) { await addListItems(open.id, f.items); made.push({ ...open, appended: f.items.length }); continue; }
    }
    if (f.kind === 'note') {
      const same = live(S.atoms).find(a => a.kind === 'note' && a.title.toLowerCase() === f.title.toLowerCase());
      if (same) { await addListItems(same.id, f.items); made.push({ ...S.atoms.find(a => a.id === same.id), appended: f.items.length }); continue; }
    }
    if (f.kind === 'expense') {
      const open = live(S.atoms).find(a => a.kind === 'expense' && !a.completedOn && a.title.toLowerCase() === f.title.toLowerCase());
      if (open) { await addCosts(open.id, f.items); made.push({ ...S.atoms.find(a => a.id === open.id), appended: f.items.length }); continue; }
    }
    if (!f.title) continue;
    made.push(await addAtom(f));
  }
  return made;
}

// ---------- categories (stored as 'elements') & subcategories (stored as 'isotopes') ----------
export function validCategoryName(name, exceptId = null) {
  const n = String(name || '').trim();
  if (!n) return 'Give the category a name';
  if (n.length > 30) return 'Keep the name under 30 characters';
  if (live(S.elements).some(e => e.id !== exceptId && e.name.toLowerCase().replace(/\s+/g, '') === n.toLowerCase().replace(/\s+/g, ''))) return `${n} already exists`;
  return null;
}
export function addCategory(name) {
  const existing = live(S.elements).find(e => M.catKey(e.name) === M.catKey(name));
  if (existing) return existing; // never make a second category with the same name
  return save('elements', M.newRecord('el', { name: name.trim(), order: Date.now() }));
}
export async function updateElement(id, patch) {
  const e = elementById(id); if (!e) return;
  return save('elements', { ...e, ...patch });
}
export const atomsInElement = id => live(S.atoms).filter(a => a.elementId === id);
export async function deleteElement(id) {
  for (const a of atomsInElement(id)) await updateAtom(a.id, { elementId: null, isotopeId: null });
  for (const i of isotopesOf(id)) await save('isotopes', { ...i, deletedAt: M.nowIso() });
  return updateElement(id, { deletedAt: M.nowIso() });
}
export function addIsotope(elementId, name) {
  const existing = isotopesOf(elementId).find(i => M.catKey(i.name) === M.catKey(name));
  if (existing) return existing;
  return save('isotopes', M.newRecord('iso', { elementId, name: name.trim(), order: Date.now() }));
}
export async function deleteIsotope(id) {
  const i = isotopeById(id); if (!i) return;
  for (const a of live(S.atoms).filter(a => a.isotopeId === id)) await updateAtom(a.id, { isotopeId: null });
  return save('isotopes', { ...i, deletedAt: M.nowIso() });
}

// ---------- folded sections (saved quietly: no re-render, so the fold animation can play) ----------
export async function setFolded(key, on) {
  on ? S.ui.folded.add(key) : S.ui.folded.delete(key);
  await db.setMeta('folded', [...S.ui.folded]);
}

// ---------- settings ----------
export async function setSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.setMeta('settings', S.settings);
  emit();
}

// ---------- backup ----------
export const exportData = () => db.exportAll();

export async function importData(json) {
  if (!json || json.app !== 'atomic') throw new Error('Not an Atomic backup file');
  let n = 0;
  for (const s of db.STORES) {
    const incoming = Array.isArray(json[s]) ? json[s] : [];
    const { merged, changed } = M.mergeRecords(S[s], incoming);
    if (changed.length) { await db.put(s, changed, { keepStamp: true }); n += changed.length; }
    S[s] = merged;
  }
  await dedupe();
  reindex(); await refreshPending(); emit(); saved();
  return n;
}

export async function resetAll({ keepSettings = false } = {}) {
  const keep = S.settings;
  await db.wipe();
  if (keepSettings) await db.setMeta('settings', keep);
  for (const s of db.STORES) S[s] = [];
  await load(); emit();
}

// ---------- cloud sync: records arriving from the back office ----------
// newest-wins merge, saved quietly (not queued to be sent back)
export async function applyRemote(itemsByStore) {
  let n = 0;
  for (const s of db.STORES) {
    const incoming = itemsByStore?.[s] || [];
    if (!incoming.length) continue;
    const { merged, changed } = M.mergeRecords(S[s], incoming);
    if (!changed.length) continue;
    await db.putQuiet(s, changed);
    S[s] = merged; n += changed.length;
  }
  if (n) { await dedupe(); reindex(); emit(); }
  return n;
}
// first sign-in on a device that has nothing of its own yet: take the cloud copy as-is
export async function replaceAll(itemsByStore) {
  for (const s of db.STORES) { S[s] = itemsByStore?.[s] || []; await db.replaceQuiet(s, S[s]); }
  await db.emptyOutbox();
  await dedupe();
  reindex(); await refreshPending(); emit();
}
export const hasOwnData = () => S.atoms.length > 0 || S.logs.length > 0;
export const refreshPendingCount = () => refreshPending();
