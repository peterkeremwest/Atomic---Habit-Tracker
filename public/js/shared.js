// Atomic — lists shared with ONE other person (v0.2.5).
// Same offline-first rule as everything else: every change is saved on this device first, then sent when online.
// A shared list is a 'slists' record (title + who is in it); each thing on it is its own 'sitems' record, so two
// people checking different items never overwrite each other. Each checked item remembers who checked it (doneBy).
import { S, save, emit } from './state.js';
import * as M from './model.js';
import * as db from './db.js';
import * as auth from './auth.js';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export const me = () => auth.user()?.sub || null;
export const listById = id => S.slists.find(l => l.id === id);
export const liveLists = () => S.slists.filter(l => !l.deletedAt).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
export const itemsOf = listId => S.sitems.filter(i => i.listId === listId && !i.deletedAt).sort(byOrder);
export const partnerOf = list => (list.members || []).find(m => m.sub !== me()) || null;
export const whoChecked = (list, item) => item.doneBy === me() ? 'you' : ((list.members || []).find(m => m.sub === item.doneBy)?.name || 'them');
export function defaultName() {
  const local = String(auth.user()?.email || '').split('@')[0];
  return local ? local[0].toUpperCase() + local.slice(1) : 'You';
}
export const myName = () => (S.settings.sharedName || '').trim() || defaultName();

// ---------- actions (each saves on this device and queues itself for the cloud) ----------
export async function createList(title, texts = []) {
  const list = await save('slists', M.newRecord('sl', { title: title.trim().slice(0, 80) || 'Shared list', createdBy: me(), members: [{ sub: me(), name: myName() }] }));
  await addItems(list.id, texts);
  return list;
}
export async function addItems(listId, texts) {
  const clean = texts.map(t => t.trim()).filter(Boolean);
  let order = itemsOf(listId).reduce((m, i) => Math.max(m, i.order ?? 0), 0);
  for (const text of clean) {
    await save('sitems', M.newRecord('si', { listId, text: text.slice(0, 200), done: false, doneBy: null, doneAt: null, order: ++order, createdBy: me() }));
  }
  return clean.length;
}
// quick add: "#shared errands: milk, stamps" adds to the list with that name, or makes it
export async function addFromQuick(title, texts) {
  const same = liveLists().find(l => l.title.toLowerCase() === title.trim().toLowerCase());
  if (same) return { list: same, appended: await addItems(same.id, texts) };
  return { list: await createList(title, texts), appended: 0 };
}
export async function toggleItem(itemId) {
  const it = S.sitems.find(i => i.id === itemId); if (!it) return null;
  const done = !it.done;
  return save('sitems', { ...it, done, doneBy: done ? me() : null, doneAt: done ? M.nowIso() : null });
}
export async function editItem(itemId, text) {
  const it = S.sitems.find(i => i.id === itemId); if (!it) return false;
  const t = String(text).trim().slice(0, 200); if (!t) return false;
  await save('sitems', { ...it, text: t });
  return true;
}
export async function setItemLink(itemId, url) {
  const it = S.sitems.find(i => i.id === itemId); if (!it) return false;
  const { link, ...rest } = it;
  await save('sitems', url ? { ...rest, link: url } : rest);
  return true;
}
export const removeItem = itemId => {
  const it = S.sitems.find(i => i.id === itemId);
  return it && save('sitems', { ...it, deletedAt: M.nowIso() });
};
export async function clearChecked(listId) {
  const done = itemsOf(listId).filter(i => i.done);
  for (const it of done) await save('sitems', { ...it, deletedAt: M.nowIso() });
  return done.length;
}
export const renameList = (id, title) => { const l = listById(id); return l && save('slists', { ...l, title: title.trim().slice(0, 80) || l.title }); };
export const setLink = (id, url) => { const l = listById(id); return l && save('slists', { ...l, link: url || '' }); };
export const deleteList = id => { const l = listById(id); return l && save('slists', { ...l, deletedAt: M.nowIso() }); }; // gone for both people
// changing "your name" re-sends every list so the other person sees the new name
export async function touchLists() { for (const l of liveLists()) await save('slists', { ...l }); }

// ---------- cloud side: records arriving from the back office ----------
// The lists you belong to are decided by the cloud; anything it no longer lists (you left, or were removed) is dropped here.
export async function applyRemote(res) {
  let n = 0;
  const lists = [];
  for (const r of res.lists || []) {
    const cur = S.slists.find(l => l.id === r.id);
    if (!cur) lists.push(r);
    else if (String(r.updatedAt) > String(cur.updatedAt)) lists.push({ ...cur, ...r });                // newer title / deletion
    else if (JSON.stringify(r.members) !== JSON.stringify(cur.members)) lists.push({ ...cur, members: r.members }); // somebody joined or left
  }
  if (lists.length) {
    await db.putQuiet('slists', lists);
    const byId = new Map(S.slists.map(l => [l.id, l]));
    for (const l of lists) byId.set(l.id, l);
    S.slists = [...byId.values()]; n += lists.length;
  }
  const { merged, changed } = M.mergeRecords(S.sitems, res.items || []);
  if (changed.length) { await db.putQuiet('sitems', changed); S.sitems = merged; n += changed.length; }
  // forget lists you are no longer in (but never one that is still waiting to be sent for the first time)
  const inCloud = new Set(res.memberOf || []);
  const waiting = new Set((await db.readOutbox()).filter(b => b.store === 'slists').map(b => b.id));
  const gone = S.slists.filter(l => !inCloud.has(l.id) && !waiting.has(l.id)).map(l => l.id);
  if (gone.length) n += await dropLists(gone);
  if (n) emit();
  return n;
}
export async function dropLists(ids) {
  const set = new Set(ids);
  const itemIds = S.sitems.filter(i => set.has(i.listId)).map(i => i.id);
  await db.removeQuiet('slists', ids); await db.removeQuiet('sitems', itemIds);
  S.slists = S.slists.filter(l => !set.has(l.id)); S.sitems = S.sitems.filter(i => !set.has(i.listId));
  emit();
  return ids.length;
}
