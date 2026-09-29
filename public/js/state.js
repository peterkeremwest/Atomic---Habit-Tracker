// Atomic — in-memory app state + every action that changes data.
// Screens read from S and call these actions; each action saves to IndexedDB, then re-renders.

import * as db from './db.js';
import * as M from './model.js';

export const S = {
  elements: [], isotopes: [], atoms: [], logs: [],
  settings: { theme: 'green', scanlines: true },
  ui: { route: 'today', filterEl: null, lowOnly: false, showDone: false, openEl: null },
  pending: 0,
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
export const emit = () => listeners.forEach(fn => fn());

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
  reindex();
  await refreshPending();
}

async function save(store, rec) {
  await db.put(store, rec);
  const list = S[store];
  const i = list.findIndex(r => r.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  if (store === 'logs') reindex();
  await refreshPending();
  emit();
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
  if (a.kind === 'task') {
    const doneNow = !a.completedOn;
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
  return updateAtom(atomId, { dueDate: M.addDays(M.todayKey(), 1) });
}

// ---------- elements & isotopes ----------
export function validSymbol(sym, exceptId = null) {
  if (!/^[A-Z][a-z]?$/.test(sym)) return 'Symbol must be 1–2 letters, like Fi or H';
  if (live(S.elements).some(e => e.symbol === sym && e.id !== exceptId)) return `${sym} is already used`;
  return null;
}
export const addElement = (symbol, name) =>
  save('elements', M.newRecord('el', { symbol, name: name.trim(), order: Date.now() }));
export async function updateElement(id, patch) {
  const e = elementById(id); if (!e) return;
  return save('elements', { ...e, ...patch });
}
export const atomsInElement = id => live(S.atoms).filter(a => a.elementId === id);
export async function deleteElement(id) {
  for (const i of isotopesOf(id)) await save('isotopes', { ...i, deletedAt: M.nowIso() });
  return updateElement(id, { deletedAt: M.nowIso() });
}
export const addIsotope = (elementId, name) =>
  save('isotopes', M.newRecord('iso', { elementId, name: name.trim(), order: Date.now() }));
export async function deleteIsotope(id) {
  const i = isotopeById(id); if (!i) return;
  for (const a of live(S.atoms).filter(a => a.isotopeId === id)) await updateAtom(a.id, { isotopeId: null });
  return save('isotopes', { ...i, deletedAt: M.nowIso() });
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
  reindex(); await refreshPending(); emit();
  return n;
}

export async function resetAll() {
  await db.wipe();
  for (const s of db.STORES) S[s] = [];
  await load(); emit();
}
