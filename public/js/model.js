// Atomic — pure data logic (no DOM, no storage). Safe to unit-test in Node.
// Every record is "sync-ready": permanent id, sourceApp, createdAt, updatedAt, soft-delete deletedAt.

export const SOURCE_APP = 'atomic';
export const SCHEMA_VERSION = 1;

const rand = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const uid = prefix => `${prefix}_${rand()}`;
export const nowIso = () => new Date().toISOString();

export function newRecord(prefix, fields) {
  const t = nowIso();
  return { id: uid(prefix), sourceApp: SOURCE_APP, createdAt: t, updatedAt: t, deletedAt: null, ...fields };
}

// ---------- dates (local calendar days as 'YYYY-MM-DD' keys) ----------
const pad = n => String(n).padStart(2, '0');
export const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayKey = () => toKey(new Date());
export const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
export const weekday = k => fromKey(k).getDay();            // 0 = Sun … 6 = Sat
export const weekStart = k => addDays(k, -((weekday(k) + 6) % 7)); // Monday
export const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export const prettyDate = k => { const d = fromKey(k); return `${DAY_NAMES[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// ---------- defaults ----------
export const DEFAULT_ELEMENTS = [
  { symbol: 'Fi', name: 'Fitness',  isotopes: ['Strength', 'Cardio', 'Mobility'] },
  { symbol: 'Cr', name: 'Career',   isotopes: ['AWS Study', 'Work'] },
  { symbol: 'Hm', name: 'Home',     isotopes: ['Chores', 'Errands'] },
  { symbol: 'Mn', name: 'Money',    isotopes: [] },
  { symbol: 'Pp', name: 'People',   isotopes: [] },
  { symbol: 'Ps', name: 'Personal', isotopes: ['Reading', 'Mind'] },
];

export function seedRecords() {
  const elements = [], isotopes = [];
  DEFAULT_ELEMENTS.forEach((e, i) => {
    const el = newRecord('el', { symbol: e.symbol, name: e.name, order: i });
    elements.push(el);
    e.isotopes.forEach((name, j) => isotopes.push(newRecord('iso', { elementId: el.id, name, order: j })));
  });
  return { elements, isotopes };
}

// ---------- atoms ----------
// kind: 'task' | 'habit'
// habit.repeat: { type:'daily' } | { type:'days', days:[0..6] } | { type:'perWeek', count:n }
// target: { kind:'check' } | { kind:'count', goal:n }
// task: dueDate 'YYYY-MM-DD' | null, completedOn 'YYYY-MM-DD' | null
export function makeAtom(f) {
  return newRecord('atom', {
    kind: f.kind || 'task',
    title: (f.title || '').trim(),
    elementId: f.elementId || null,
    isotopeId: f.isotopeId || null,
    moleculeId: null,          // reserved: goals (later version)
    orbitId: null,             // reserved: time blocks (later version)
    repeat: f.kind === 'habit' ? (f.repeat || { type: 'daily' }) : null,
    target: f.target || { kind: 'check' },
    dueDate: f.kind === 'task' ? (f.dueDate ?? null) : null,
    completedOn: null,
    energy: f.energy || null,  // 'low' | 'high' | null
    note: f.note || '',
    order: f.order ?? Date.now(),
  });
}

export const logId = (atomId, date) => `${atomId}|${date}`;

export function isScheduled(atom, k) {
  if (atom.kind !== 'habit') return false;
  const r = atom.repeat || { type: 'daily' };
  if (r.type === 'days') return (r.days || []).includes(weekday(k));
  return true; // daily & perWeek are offered every day
}

// logsByDate: Map<dateKey, log> for ONE atom
export function weekDoneCount(atom, logsByDate, k, { includeSkips = false } = {}) {
  let n = 0, d = weekStart(k);
  for (let i = 0; i < 7; i++, d = addDays(d, 1)) {
    const s = logsByDate.get(d)?.status;
    if (s === 'done' || (includeSkips && s === 'skipped')) n++;
  }
  return n;
}

export function isDueToday(atom, logsByDate, k) {
  if (atom.deletedAt) return false;
  if (atom.kind === 'task') return !atom.completedOn && (!atom.dueDate || atom.dueDate <= k);
  if (!isScheduled(atom, k)) return false;
  if (atom.repeat?.type === 'perWeek') {
    const todays = logsByDate.get(k);
    if (todays) return true; // keep it visible today once touched
    return weekDoneCount(atom, logsByDate, k, { includeSkips: true }) < atom.repeat.count;
  }
  return true;
}

export function statusFor(atom, logsByDate, k) {
  if (atom.kind === 'task') return atom.completedOn ? 'done' : null;
  return logsByDate.get(k)?.status || null;
}

// Streak rules: 'done' counts; 'skipped' and 'partial' bridge the gap (never break, never add);
// today still open never breaks it. perWeek habits count streaks in weeks.
export function streak(atom, logsByDate, today) {
  if (atom.kind !== 'habit') return { value: 0, unit: 'd' };
  let created = atom.createdAt ? toKey(new Date(atom.createdAt)) : addDays(today, -400);
  for (const d of logsByDate.keys()) if (d < created) created = d; // back-filled history counts too
  if (atom.repeat?.type === 'perWeek') {
    let n = 0, w = weekStart(today);
    for (let i = 0; i < 60; i++, w = addDays(w, -7)) {
      const met = weekDoneCount(atom, logsByDate, w, { includeSkips: true }) >= atom.repeat.count;
      if (met) n++;
      else if (i > 0) break;
      if (w <= weekStart(created)) break;
    }
    return { value: n, unit: 'w' };
  }
  let n = 0, d = today;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (d < created) break;
    if (!isScheduled(atom, d)) continue;
    const s = logsByDate.get(d)?.status;
    if (s === 'done') n++;
    else if (s === 'skipped' || s === 'partial') continue;
    else if (d === today) continue;
    else break;
  }
  return { value: n, unit: 'd' };
}

// Counter habits: status follows the count.
export function statusFromCount(count, goal) {
  if (count >= goal) return 'done';
  if (count > 0) return 'partial';
  return null;
}

// ---------- quick-add parser ----------
// Examples:
//   "gym mon wed fri #Fi.strength"  -> habit on Mon/Wed/Fri in Fitness › Strength
//   "read 20 min daily #Ps !low"    -> daily habit, low energy
//   "water x8 daily"                -> counter habit, goal 8/day
//   "run 3x #Fi"                    -> habit, 3 times per week
//   "renew passport tomorrow #Hm"   -> task due tomorrow
const DAY_TOKENS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function parseQuickAdd(text, elements = [], isotopes = [], today = todayKey()) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const out = { kind: 'task', title: '', elementId: null, isotopeId: null, repeat: null,
                target: { kind: 'check' }, dueDate: null, energy: null };
  const days = new Set();
  const rest = [];
  for (const raw of words) {
    const w = raw.toLowerCase();
    if (raw.startsWith('#') && raw.length > 1) {
      const [sym, iso] = raw.slice(1).split(/[./:]/);
      const el = elements.find(e => !e.deletedAt && e.symbol.toLowerCase() === sym.toLowerCase());
      if (el) {
        out.elementId = el.id;
        if (iso) {
          const i = isotopes.find(x => !x.deletedAt && x.elementId === el.id && x.name.toLowerCase().startsWith(iso.toLowerCase()));
          if (i) out.isotopeId = i.id;
        }
        continue;
      }
    }
    if (w === 'daily' || w === 'everyday') { out.kind = 'habit'; out.repeat = { type: 'daily' }; continue; }
    if (w === 'weekdays') { [1, 2, 3, 4, 5].forEach(d => days.add(d)); continue; }
    if (w === 'weekends') { [0, 6].forEach(d => days.add(d)); continue; }
    if (w in DAY_TOKENS) { days.add(DAY_TOKENS[w]); continue; }
    let m;
    if ((m = w.match(/^(\d+)x(\/w(eek)?)?$/)) && +m[1] >= 1 && +m[1] <= 7) {
      out.kind = 'habit'; out.repeat = { type: 'perWeek', count: +m[1] }; continue;
    }
    if ((m = w.match(/^x(\d+)$/)) && +m[1] >= 2) { out.target = { kind: 'count', goal: +m[1] }; continue; }
    if (w === '!low' || w === '!high') { out.energy = w.slice(1); continue; }
    if (w === 'today') { out.dueDate = today; continue; }
    if (w === 'tomorrow' || w === 'tmr') { out.dueDate = addDays(today, 1); continue; }
    rest.push(raw);
  }
  if (days.size) { out.kind = 'habit'; out.repeat = days.size === 7 ? { type: 'daily' } : { type: 'days', days: [...days].sort() }; }
  if (out.target.kind === 'count' && out.kind === 'task') { out.kind = 'habit'; out.repeat = out.repeat || { type: 'daily' }; }
  if (out.kind === 'habit') out.dueDate = null;
  out.title = rest.join(' ');
  return out;
}

export function describeRepeat(atom) {
  const r = atom.repeat;
  if (!r) return '';
  if (r.type === 'daily') return 'daily';
  if (r.type === 'perWeek') return `${r.count}x/wk`;
  if (r.type === 'days') {
    const d = r.days || [];
    if (d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x))) return 'weekdays';
    if (d.length === 2 && d.includes(0) && d.includes(6)) return 'weekends';
    return d.map(x => DAY_NAMES[x].slice(0, 2)).join(' ');
  }
  return '';
}

// ---------- import merge (same newest-wins rule the cloud sync will use) ----------
export function mergeRecords(local, incoming) {
  const byId = new Map(local.map(r => [r.id, r]));
  const changed = [];
  for (const r of incoming) {
    if (!r || typeof r.id !== 'string') continue;
    const cur = byId.get(r.id);
    if (!cur || String(r.updatedAt) > String(cur.updatedAt)) { byId.set(r.id, r); changed.push(r); }
  }
  return { merged: [...byId.values()], changed };
}
