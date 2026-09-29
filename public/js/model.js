// Atomic — pure data logic (no DOM, no storage). Safe to unit-test in Node.
// Every record is "sync-ready": permanent id, sourceApp, createdAt, updatedAt, soft-delete deletedAt.
//
// Internal names vs what the app shows:
//   atom (record)  -> an "item": kind 'task' (one-time) | 'habit' | 'block' (time block) | 'list'
//   element (store)-> a "category" (shown as #name)
//   isotope (store)-> a "subcategory"

export const SOURCE_APP = 'atomic';
export const SCHEMA_VERSION = 2;

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
export const weekday = k => fromKey(k).getDay();                    // 0 = Sun … 6 = Sat
export const weekStart = k => addDays(k, -((weekday(k) + 6) % 7));  // Monday
export const monthStart = k => k.slice(0, 8) + '01';
export const daysInMonth = k => { const d = fromKey(k); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const prettyDate = k => { const d = fromKey(k); return `${DAY_FULL[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const shortDate = k => { const d = fromKey(k); return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`; };
export const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

// times as 'HH:MM' (24h) internally, shown as 12h
export function fmtTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m ? `${h}:${pad(m)} ${ap}` : `${h} ${ap}`;
}
export const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---------- categories ----------
export const tagOf = name => '#' + String(name).toLowerCase().replace(/\s+/g, '');
export const DEFAULT_CATEGORIES = [
  { name: 'Fitness',  subs: ['Strength', 'Cardio', 'Mobility'] },
  { name: 'Career',   subs: ['AWS Study', 'Work'] },
  { name: 'Home',     subs: ['Chores', 'Errands'] },
  { name: 'Money',    subs: [] },
  { name: 'People',   subs: [] },
  { name: 'Personal', subs: ['Reading', 'Mind'] },
];
export function seedRecords() {
  const elements = [], isotopes = [];
  DEFAULT_CATEGORIES.forEach((c, i) => {
    const el = newRecord('el', { name: c.name, order: i });
    elements.push(el);
    c.subs.forEach((name, j) => isotopes.push(newRecord('iso', { elementId: el.id, name, order: j })));
  });
  return { elements, isotopes };
}
export function findCategory(tag, elements) {
  const t = tag.toLowerCase().replace(/\s+/g, '');
  const live = elements.filter(e => !e.deletedAt);
  return live.find(e => e.name.toLowerCase().replace(/\s+/g, '') === t)
      || live.find(e => (e.symbol || '').toLowerCase() === t)
      || (t.length >= 3 ? live.filter(e => e.name.toLowerCase().replace(/\s+/g, '').startsWith(t)) : []).find((e, _, arr) => arr.length === 1)
      || null;
}

// ---------- items ----------
// habit.repeat:
//   { type:'daily' }
//   { type:'days', days:[0..6] }        specific weekdays          -> WEEKLY section
//   { type:'perWeek', count:n }         n times any day this week  -> WEEKLY
//   { type:'perMonth', count:n }        n times any day this month -> MONTHLY
//   { type:'monthDay', day:1..31 }      on that day of the month   -> MONTHLY
// target: { kind:'check' } | { kind:'count', goal:n }
// task:  dueDate | null, completedOn | null
// block: start 'HH:MM', end 'HH:MM', date | null, repeat null | {type:'daily'|'days'}
// list:  items [{ id, text, done }], completedOn set automatically when every item is checked
export function makeAtom(f) {
  const kind = f.kind || 'task';
  return newRecord('atom', {
    kind,
    title: (f.title || '').trim(),
    elementId: f.elementId || null,
    isotopeId: f.isotopeId || null,
    moleculeId: null,          // reserved: goals (later version)
    repeat: kind === 'habit' ? (f.repeat || { type: 'daily' }) : kind === 'block' ? (f.repeat || null) : null,
    target: kind === 'habit' ? (f.target || { kind: 'check' }) : { kind: 'check' },
    dueDate: kind === 'task' ? (f.dueDate ?? null) : null,
    date: kind === 'block' ? (f.repeat ? null : (f.date || todayKey())) : null,
    start: kind === 'block' ? f.start : null,
    end: kind === 'block' ? f.end : null,
    items: kind === 'list' ? (f.items || []).map(t => (typeof t === 'string' ? { id: uid('li'), text: t, done: false } : t)) : null,
    completedOn: null,
    energy: f.energy || null,
    note: f.note || '',
    order: f.order ?? Date.now(),
  });
}

export const logId = (atomId, date) => `${atomId}|${date}`;

export function frequency(a) {
  if (a.kind === 'block') return 'schedule';
  if (a.kind === 'list') return 'list';
  if (a.kind === 'task') return 'once';
  const t = a.repeat?.type;
  if (t === 'days' || t === 'perWeek') return 'weekly';
  if (t === 'perMonth' || t === 'monthDay') return 'monthly';
  return 'daily';
}

export function isScheduled(a, k) {
  if (a.kind === 'block') {
    if (!a.repeat) return a.date === k;
    if (a.repeat.type === 'days') return (a.repeat.days || []).includes(weekday(k));
    return true;
  }
  if (a.kind !== 'habit') return false;
  const r = a.repeat || { type: 'daily' };
  if (r.type === 'days') return (r.days || []).includes(weekday(k));
  if (r.type === 'monthDay') return fromKey(k).getDate() === Math.min(r.day, daysInMonth(k));
  return true; // daily, perWeek, perMonth: available every day
}

// how many 'done' days inside the week/month containing k (skips optionally count as excused)
export function periodDoneCount(a, logsByDate, k, { includeSkips = false } = {}) {
  const monthly = a.repeat?.type === 'perMonth';
  let d = monthly ? monthStart(k) : weekStart(k);
  const len = monthly ? daysInMonth(k) : 7;
  let n = 0;
  for (let i = 0; i < len; i++, d = addDays(d, 1)) {
    const s = logsByDate.get(d)?.status;
    if (s === 'done' || (includeSkips && s === 'skipped')) n++;
  }
  return n;
}
export const isQuota = a => a.kind === 'habit' && (a.repeat?.type === 'perWeek' || a.repeat?.type === 'perMonth');
export const quotaMet = (a, logs, k) => isQuota(a) && periodDoneCount(a, logs, k, { includeSkips: true }) >= a.repeat.count;

// Should this item appear on the day screen for k? (today = the real current day)
//   today:  open tasks that are due/overdue/undated, plus anything finished today
//   past:   tasks due or finished that day, lists finished that day
//   future: tasks due that day
export function showsOn(a, logsByDate, k, today = todayKey()) {
  if (a.deletedAt) return false;
  if (a.kind === 'task') {
    if (k === today) return a.completedOn ? a.completedOn === k : (!a.dueDate || a.dueDate <= k);
    if (k < today) return a.completedOn === k || (a.dueDate === k && (!a.completedOn || a.completedOn >= k));
    return a.dueDate === k;
  }
  if (a.kind === 'list') {
    if (k === today) return a.completedOn ? a.completedOn === k : true;
    return k < today && a.completedOn === k;
  }
  if (a.kind === 'habit') {
    const created = a.createdAt ? toKey(new Date(a.createdAt)) : '0000';
    const firstLog = [...logsByDate.keys()].sort()[0];
    const start = firstLog && firstLog < created ? firstLog : created;
    if (k < start) return false; // don't show habits on days before they existed
  }
  return isScheduled(a, k);
}

// Day summary for the calendar: planned = dated tasks / time blocks / specific-day habits;
// due/done count habits + tasks (not blocks, not already-met quotas).
export function daySummary(atoms, logsFor, k, today = todayKey()) {
  let planned = false, due = 0, done = 0;
  for (const a of atoms) {
    const logs = logsFor(a.id);
    if (!showsOn(a, logs, k, today)) continue;
    if (a.kind === 'block' || (a.kind === 'task' && a.dueDate === k) ||
        (a.kind === 'habit' && ['days', 'monthDay'].includes(a.repeat?.type))) planned = true;
    if (!countsToday(a, logs, k)) continue;
    due++;
    if (statusFor(a, logs, k) === 'done') done++;
  }
  return { planned, due, done };
}

export function relativeDay(k, today = todayKey()) {
  const diff = Math.round((fromKey(k) - fromKey(today)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

// 'done' | 'partial' | 'skipped' | 'met' (weekly/monthly quota already reached) | null
export function statusFor(a, logsByDate, k) {
  if (a.kind === 'task' || a.kind === 'list') return a.completedOn ? 'done' : null;
  if (a.kind === 'block') return null;
  const s = logsByDate.get(k)?.status || null;
  if (s) return s;
  return quotaMet(a, logsByDate, k) ? 'met' : null;
}

// Counts toward today's progress? (time blocks and already-met quotas don't)
export function countsToday(a, logsByDate, k) {
  if (a.kind === 'block') return false;
  const s = statusFor(a, logsByDate, k);
  return s !== 'met' && s !== 'skipped';
}

// Streak rules: 'done' counts; 'skipped'/'partial' bridge; today still open never breaks it.
// Weekly quotas count in weeks, monthly quotas in months, everything else in days.
export function streak(a, logsByDate, today) {
  if (a.kind !== 'habit') return { value: 0, unit: 'day' };
  let created = a.createdAt ? toKey(new Date(a.createdAt)) : addDays(today, -400);
  for (const d of logsByDate.keys()) if (d < created) created = d;
  if (isQuota(a)) {
    const monthly = a.repeat.type === 'perMonth';
    const step = p => monthly ? monthStart(addDays(p, -1)) : addDays(p, -7);
    let n = 0, p = monthly ? monthStart(today) : weekStart(today);
    for (let i = 0; i < 60; i++, p = step(p)) {
      if (quotaMet(a, logsByDate, p)) n++;
      else if (i > 0) break;
      if (p <= (monthly ? monthStart(created) : weekStart(created))) break;
    }
    return { value: n, unit: monthly ? 'month' : 'week' };
  }
  let n = 0, d = today;
  for (let i = 0; i < 800; i++, d = addDays(d, -1)) {
    if (d < created) break;
    if (!isScheduled(a, d)) continue;
    const s = logsByDate.get(d)?.status;
    if (s === 'done') n++;
    else if (s === 'skipped' || s === 'partial') continue;
    else if (d === today) continue;
    else break;
  }
  return { value: n, unit: 'day' };
}
export const streakText = st => st.value ? `${st.value}-${st.unit} streak` : '';

export function statusFromCount(count, goal) {
  if (count >= goal) return 'done';
  if (count > 0) return 'partial';
  return null;
}

const joinWords = arr => arr.length <= 2 ? arr.join(' & ') : arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];
export function describeRepeat(a) {
  const r = a.repeat;
  if (!r) return a.kind === 'block' ? '' : '';
  if (r.type === 'daily') return 'every day';
  if (r.type === 'perWeek') return r.count === 1 ? 'once a week' : `${r.count} times a week`;
  if (r.type === 'perMonth') return r.count === 1 ? 'once a month' : `${r.count} times a month`;
  if (r.type === 'monthDay') return `every month on the ${ordinal(r.day)}`;
  if (r.type === 'days') {
    const d = r.days || [];
    if (d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x))) return 'weekdays';
    if (d.length === 2 && d.includes(0) && d.includes(6)) return 'weekends';
    return 'every ' + joinWords([...d].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map(x => DAY_FULL[x]));
  }
  return '';
}

// ---------- quick-add parser ----------
// Examples:
//   #fitness workout monday wednesday friday   -> weekly habit on Mon/Wed/Fri, category Fitness
//   read 20 min daily #personal !low           -> daily habit, low energy
//   water x8 daily                             -> counter habit, 8 a day
//   run 3x a week #fitness/cardio              -> weekly habit, 3 times any day
//   pay rent monthly 1st #money                -> monthly habit on the 1st
//   renew passport tomorrow #home              -> one-time task due tomorrow
//   #timeblock work 5 pm - 11pm                -> time block today
//   date 2pm-7pm, movie 5pm-8pm                -> two time blocks (a time range is enough)
//   #list groceries: eggs, soap, juice         -> checklist
const DAY_WORDS = {};
DAY_FULL.forEach((n, i) => {
  const l = n.toLowerCase();
  [l, l + 's', l.slice(0, 3), l.slice(0, 3) + 's'].forEach(w => (DAY_WORDS[w] = i));
});
Object.assign(DAY_WORDS, { tues: 2, weds: 3, thur: 4, thurs: 4 });

const RANGE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

function to24(h, m, ap) { if (ap) { ap = ap[0].toLowerCase(); if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0; } return `${pad(h)}:${pad(m || 0)}`; }
export function parseRange(str, { loose = false } = {}) {
  const m = str.match(RANGE);
  if (!m) return null;
  let [, h1, m1, a1, h2, m2, a2] = m;
  h1 = +h1; h2 = +h2; m1 = +(m1 || 0); m2 = +(m2 || 0);
  if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  const hasSignal = a1 || a2 || m[2] || m[5];
  if (!hasSignal && !loose) return null;
  if (!a1 && a2 && h1 <= 12 && h2 <= 12) {       // "5-11pm" -> 5pm; "11-2pm" -> 11am
    a1 = a2;
    const s = +to24(h1, m1, a1).slice(0, 2), e = +to24(h2, m2, a2).slice(0, 2);
    if (s > e) a1 = a1[0].toLowerCase() === 'p' ? 'am' : 'pm';
  }
  if (!a1 && !a2 && h1 <= 12 && h2 <= 12) {        // "9-5" -> 9am-5pm, "2-7" -> 2pm-7pm
    if (h1 > h2) { a1 = 'am'; a2 = 'pm'; } else if (h1 < 8) { a1 = a2 = 'pm'; }
  }
  if (a1 && !a2 && h2 <= 12) a2 = (+to24(h2, m2, a1).slice(0, 2) < +to24(h1, m1, a1).slice(0, 2)) ? 'pm' : a1;
  return { start: to24(h1, m1, a1), end: to24(h2, m2, a2), match: m[0], index: m.index };
}

// Pull #tags out of the text. Returns { rest, tags:[{name, sub}], special:Set }
function takeTags(text) {
  const special = new Set(), tags = [];
  const rest = text.replace(/#([\p{L}\p{N}_-]+)(?:[./]([\p{L}\p{N}_ -]+?))?(?=$|[\s,:])/gu, (_, name, sub) => {
    const l = name.toLowerCase();
    if (['list', 'checklist'].includes(l)) { special.add('list'); return ' '; }
    if (['timeblock', 'block', 'tb', 'schedule'].includes(l)) { special.add('block'); return ' '; }
    tags.push({ name, sub: sub ? sub.trim() : null });
    return ' ';
  });
  return { rest, tags, special };
}

function resolveTags(tags, elements, isotopes) {
  const out = { elementId: null, isotopeId: null, newCategory: null, newSub: null };
  const t = tags[0];
  if (!t) return out;
  const el = findCategory(t.name, elements);
  if (el) {
    out.elementId = el.id;
    if (t.sub) {
      const s = t.sub.toLowerCase();
      const iso = isotopes.find(x => !x.deletedAt && x.elementId === el.id && x.name.toLowerCase().startsWith(s));
      if (iso) out.isotopeId = iso.id; else out.newSub = t.sub;
    }
  } else {
    out.newCategory = t.name.charAt(0).toUpperCase() + t.name.slice(1);
    if (t.sub) out.newSub = t.sub;
  }
  return out;
}

const clean = s => s.replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s:,-]+$/g, '').trim();

function parseDayWords(words, today) {
  const days = new Set(); let date = null, repeat = null; const rest = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[,.]$/, '');
    if (w === 'every' && i + 1 < words.length && ['day', 'day,'].includes(words[i + 1].toLowerCase())) { repeat = { type: 'daily' }; i++; continue; }
    if (w === 'every' && i + 1 < words.length && words[i + 1].toLowerCase().replace(/[,.]$/, '') in DAY_WORDS) continue;
    if (w in DAY_WORDS) { days.add(DAY_WORDS[w]); continue; }
    if (w === 'weekdays') { [1, 2, 3, 4, 5].forEach(d => days.add(d)); continue; }
    if (w === 'weekends') { [0, 6].forEach(d => days.add(d)); continue; }
    if (w === 'daily' || w === 'everyday') { repeat = { type: 'daily' }; continue; }
    if (w === 'today' || w === 'tonight') { date = today; continue; }
    if (w === 'tomorrow' || w === 'tmr' || w === 'tmrw') { date = addDays(today, 1); continue; }
    if (['and', '&', 'on'].includes(w) && rest.length && i + 1 < words.length && words[i + 1].toLowerCase().replace(/[,.]$/, '') in DAY_WORDS) continue;
    rest.push(words[i]);
  }
  if (days.size) repeat = days.size === 7 ? { type: 'daily' } : { type: 'days', days: [...days].sort() };
  return { days, date, repeat, rest };
}

export function parseQuickAdd(text, elements = [], isotopes = [], today = todayKey(), defaultDate = today) {
  const { rest: noTags, tags, special } = takeTags(String(text));
  const cat = resolveTags(tags, elements, isotopes);
  const base = { ...cat, energy: null };
  let body = noTags.replace(/!(low|high)\b/gi, (_, e) => { base.energy = e.toLowerCase(); return ' '; });

  // ----- list -----
  if (special.has('list')) {
    body = body.replace(/^\s*:\s*/, '');
    const ci = body.indexOf(':');
    let title, items;
    if (ci >= 0) { title = clean(body.slice(0, ci)); items = body.slice(ci + 1).split(/[,;\n]/).map(clean).filter(Boolean); }
    else { const parts = body.split(/[,;\n]/).map(clean).filter(Boolean); title = parts.length > 1 ? 'List' : (parts[0] || 'List'); items = parts.length > 1 ? parts : []; }
    return [{ ...base, kind: 'list', title: title || 'List', items }];
  }

  // ----- time blocks (explicit #timeblock, or any clear time range like 5pm-8pm) -----
  const explicit = special.has('block');
  const segments = explicit ? body.split(/\s*,\s*|\s+or\s+|\s+and\s+(?=\S+\s+\d)/i) : [body];
  const blocks = [];
  for (const seg of segments) {
    const r = parseRange(seg, { loose: explicit });
    if (!r) continue;
    const words = (seg.slice(0, r.index) + ' ' + seg.slice(r.index + r.match.length)).split(/\s+/).filter(Boolean)
      .filter(w => !/^(from|at)$/i.test(w));
    const dw = parseDayWords(words, today);
    blocks.push({ ...base, kind: 'block', title: clean(dw.rest.join(' ')) || 'Time block', start: r.start, end: r.end,
      repeat: dw.repeat, date: dw.repeat ? null : (dw.date || defaultDate) });
  }
  if (blocks.length) return blocks;

  // ----- habits & one-time tasks -----
  const words = body.split(/\s+/).filter(Boolean);
  const out = { ...base, kind: 'task', repeat: null, target: { kind: 'check' }, dueDate: null };
  let count = null, per = null, monthDay = null, monthly = false, weekly = false;
  const keep = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[,.]$/, '');
    const nx = (words[i + 1] || '').toLowerCase(), nx2 = (words[i + 2] || '').toLowerCase();
    let m;
    if ((m = w.match(/^(\d)x(?:\/(w|wk|week|m|mo|month))?$/))) {
      count = +m[1]; per = m[2] ? (m[2][0] === 'm' ? 'month' : 'week') : null;
      if (!per && /^(a|per|\/)$/.test(nx) && /^(week|wk|month)/.test(nx2)) { per = nx2.startsWith('m') ? 'month' : 'week'; i += 2; }
      else if (!per && /^(weekly|monthly)$/.test(nx)) { per = nx === 'monthly' ? 'month' : 'week'; i += 1; }
      continue;
    }
    if ((m = w.match(/^(\d)$/)) && /^times?$/.test(nx) && /^(a|per)$/.test(nx2)) {
      const unit = (words[i + 3] || '').toLowerCase();
      if (/^(week|wk|month)/.test(unit)) { count = +m[1]; per = unit.startsWith('m') ? 'month' : 'week'; i += 3; continue; }
    }
    if (w === 'once' && /^(a|per)$/.test(nx) && /^(week|month)/.test(nx2)) { count = 1; per = nx2.startsWith('m') ? 'month' : 'week'; i += 2; continue; }
    if (w === 'weekly') { weekly = true; continue; }
    if (w === 'monthly' || (w === 'every' && nx === 'month')) { monthly = true; if (w === 'every') i++; continue; }
    if ((m = w.match(/^(\d{1,2})(st|nd|rd|th)$/)) && +m[1] >= 1 && +m[1] <= 31) { monthDay = +m[1]; continue; }
    if (w === 'on' && /^the$/.test(nx) && /^\d{1,2}(st|nd|rd|th)$/.test(nx2)) { continue; }
    if (w === 'the' && /^\d{1,2}(st|nd|rd|th)$/.test(nx)) continue;
    if ((m = w.match(/^x(\d+)$/)) && +m[1] >= 2) { out.target = { kind: 'count', goal: Math.min(99, +m[1]) }; continue; }
    keep.push(words[i]);
  }
  const dw = parseDayWords(keep, today);
  if (monthDay && (monthly || !dw.repeat)) out.repeat = { type: 'monthDay', day: monthDay };
  else if (count && per === 'month') out.repeat = { type: 'perMonth', count };
  else if (count && (per === 'week' || !per)) out.repeat = { type: 'perWeek', count: Math.min(count, 7) };
  else if (monthly) out.repeat = { type: 'perMonth', count: 1 };
  else if (dw.repeat) out.repeat = dw.repeat;
  else if (weekly) out.repeat = { type: 'perWeek', count: 1 };
  if (!out.repeat && out.target.kind === 'count') out.repeat = { type: 'daily' };
  if (out.repeat) out.kind = 'habit'; else out.dueDate = dw.date || (defaultDate !== today ? defaultDate : null);
  out.title = clean(dw.rest.join(' '));
  return [out];
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
