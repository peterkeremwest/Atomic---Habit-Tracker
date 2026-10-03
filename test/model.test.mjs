import assert from 'node:assert/strict';
import * as M from '../public/js/model.js';

const { elements, isotopes } = M.seedRecords();
const [fit, career, home, money] = elements;
const T = '2026-09-29'; // Tuesday
const P = t => M.parseQuickAdd(t, elements, isotopes, T);
const one = t => { const r = P(t); assert.equal(r.length, 1, t); return r[0]; };

// habits & tasks
let p = one('#fitness workout monday wednesday friday');
assert.equal(p.kind, 'habit'); assert.deepEqual(p.repeat, { type: 'days', days: [1, 3, 5] });
assert.equal(p.title, 'workout'); assert.equal(p.elementId, fit.id);
p = one('workout mondays and wednesdays #fitness/strength');
assert.deepEqual(p.repeat, { type: 'days', days: [1, 3] }); assert.equal(p.isotopeId, isotopes[0].id); assert.equal(p.title, 'workout');
p = one('read 20 min daily #personal !low'); assert.equal(p.kind, 'habit'); assert.equal(p.repeat.type, 'daily'); assert.equal(p.energy, 'low'); assert.equal(p.title, 'read 20 min');
p = one('water x8'); assert.deepEqual(p.target, { kind: 'count', goal: 8 }); assert.equal(p.repeat.type, 'daily');
p = one('run 3x a week #fit'); assert.deepEqual(p.repeat, { type: 'perWeek', count: 3 }); assert.equal(p.elementId, fit.id); assert.equal(p.title, 'run');
p = one('run 3 times a week'); assert.deepEqual(p.repeat, { type: 'perWeek', count: 3 });
p = one('call grandma weekly'); assert.deepEqual(p.repeat, { type: 'perWeek', count: 1 });
p = one('deep clean monthly'); assert.deepEqual(p.repeat, { type: 'perMonth', count: 1 });
p = one('haircut 2x/month'); assert.deepEqual(p.repeat, { type: 'perMonth', count: 2 });
p = one('pay rent monthly 1st #money'); assert.deepEqual(p.repeat, { type: 'monthDay', day: 1 }); assert.equal(p.title, 'pay rent'); assert.equal(p.elementId, money.id);
p = one('pay rent every month on the 15th'); assert.deepEqual(p.repeat, { type: 'monthDay', day: 15 }); assert.equal(p.title, 'pay rent');
p = one('renew passport tomorrow #home'); assert.equal(p.kind, 'task'); assert.equal(p.dueDate, '2026-09-30'); assert.equal(p.elementId, home.id);
p = one('buy a gift'); assert.equal(p.kind, 'task'); assert.equal(p.dueDate, null); assert.equal(p.title, 'buy a gift');
p = one('meditate #mindfulness'); assert.equal(p.newCategory, 'Mindfulness'); assert.equal(p.elementId, null);

// time blocks
p = one('#timeblock work 5 pm - 11pm'); assert.equal(p.kind, 'block'); assert.equal(p.start, '17:00'); assert.equal(p.end, '23:00'); assert.equal(p.title, 'work'); assert.equal(p.date, T);
let r = P('#timeblock date 2pm-7pm, movie 5pm-8pm'); assert.equal(r.length, 2);
assert.equal(r[0].title, 'date'); assert.equal(r[0].start, '14:00'); assert.equal(r[1].title, 'movie'); assert.equal(r[1].end, '20:00');
p = one('movie 5pm-8pm'); assert.equal(p.kind, 'block');
p = one('work 9am-5pm weekdays'); assert.deepEqual(p.repeat, { type: 'days', days: [1, 2, 3, 4, 5] }); assert.equal(p.date, null);
p = one('#timeblock gym 5-7'); assert.equal(p.start, '17:00'); assert.equal(p.end, '19:00');
p = one('#timeblock shift 9-5'); assert.equal(p.start, '09:00'); assert.equal(p.end, '17:00');
p = one('lunch 11:30-1pm tomorrow'); assert.equal(p.start, '11:30'); assert.equal(p.end, '13:00'); assert.equal(p.date, '2026-09-30');
p = one('read chapters 1-2'); assert.equal(p.kind, 'task'); // no time signal -> not a block
assert.equal(M.fmtTime('17:00'), '5 PM'); assert.equal(M.fmtTime('09:30'), '9:30 AM'); assert.equal(M.fmtTime('00:00'), '12 AM');

// lists
p = one('#list : groceries: eggs, soap, juice'); assert.equal(p.kind, 'list'); assert.equal(p.title, 'groceries');
assert.deepEqual(p.items, ['eggs', 'soap', 'juice']);
p = one('#list packing #home'); assert.equal(p.title, 'packing'); assert.deepEqual(p.items, []); assert.equal(p.elementId, home.id);

// dates
assert.equal(M.weekday(T), 2); assert.equal(M.weekStart(T), '2026-09-28'); assert.equal(M.addDays('2026-12-31', 1), '2027-01-01');
assert.equal(M.monthStart(T), '2026-09-01'); assert.equal(M.daysInMonth('2026-02-10'), 28);

// frequency sections
const mk = f => { const a = M.makeAtom(f); a.createdAt = '2026-09-01T00:00:00Z'; return a; };
assert.equal(M.frequency(mk({ kind: 'habit', title: 'a', repeat: { type: 'daily' } })), 'daily');
assert.equal(M.frequency(mk({ kind: 'habit', title: 'a', repeat: { type: 'days', days: [1] } })), 'weekly');
assert.equal(M.frequency(mk({ kind: 'habit', title: 'a', repeat: { type: 'monthDay', day: 3 } })), 'monthly');
assert.equal(M.frequency(mk({ kind: 'task', title: 'a' })), 'once');

// streaks
const h = mk({ kind: 'habit', title: 'x', repeat: { type: 'daily' } });
const L = new Map([['2026-09-28', { status: 'done' }], ['2026-09-27', { status: 'skipped' }], ['2026-09-26', { status: 'done' }], ['2026-09-24', { status: 'done' }]]);
assert.deepEqual(M.streak(h, L, T), { value: 2, unit: 'day' });
L.set(T, { status: 'done' }); assert.equal(M.streak(h, L, T).value, 3);
assert.equal(M.streakText({ value: 3, unit: 'day' }), '3-day streak');
const d = mk({ kind: 'habit', title: 'y', repeat: { type: 'days', days: [1, 3, 5] } });
assert.equal(M.isScheduled(d, T), false);
assert.equal(M.streak(d, new Map([['2026-09-28', { status: 'done' }], ['2026-09-25', { status: 'done' }], ['2026-09-23', { status: 'done' }]]), T).value, 3);
const w = mk({ kind: 'habit', title: 'z', repeat: { type: 'perWeek', count: 2 } });
const L3 = new Map([['2026-09-28', { status: 'done' }], ['2026-09-22', { status: 'done' }], ['2026-09-24', { status: 'done' }]]);
assert.equal(M.statusFor(w, L3, T), null); L3.set(T, { status: 'done' });
assert.equal(M.streak(w, L3, T).value, 2); assert.equal(M.statusFor(w, L3, '2026-09-30'), 'met');
assert.equal(M.countsToday(w, L3, '2026-09-30'), false);
const mo = mk({ kind: 'habit', title: 'm', repeat: { type: 'monthDay', day: 31 } });
assert.equal(M.isScheduled(mo, '2026-09-30'), true); assert.equal(M.isScheduled(mo, '2026-09-29'), false);
const pm = mk({ kind: 'habit', title: 'pm', repeat: { type: 'perMonth', count: 1 } });
assert.equal(M.streak(pm, new Map([['2026-09-03', { status: 'done' }], ['2026-08-20', { status: 'done' }]]), T).value, 2);

// visibility: done items stay on today
const t = mk({ kind: 'task', title: 'a', dueDate: '2026-10-05' }); assert.equal(M.showsOn(t, new Map(), T, T), false);
assert.equal(M.showsOn(t, new Map(), '2026-10-05', T), true); // future day shows it
t.dueDate = '2026-09-20'; assert.equal(M.showsOn(t, new Map(), T, T), true);
assert.equal(M.showsOn(t, new Map(), '2026-09-20', T), true);   // past due day
assert.equal(M.showsOn(t, new Map(), '2026-09-22', T), false);  // other past day
t.completedOn = T; assert.equal(M.showsOn(t, new Map(), T, T), true); assert.equal(M.showsOn(t, new Map(), '2026-09-30', '2026-09-30'), false);
const hh = mk({ kind: 'habit', title: 'h', repeat: { type: 'daily' } });
assert.equal(M.showsOn(hh, new Map(), '2026-08-01', T), false); // before it existed
assert.equal(M.showsOn(hh, new Map(), '2026-10-10', T), true);
const sum = M.daySummary([hh, t], id => new Map(), T, T); assert.deepEqual(sum, { planned: false, due: 2, done: 1 });
assert.equal(M.relativeDay('2026-09-28', T), 'yesterday'); assert.equal(M.relativeDay('2026-10-02', T), 'in 3 days');
let pd = M.parseQuickAdd('dentist', elements, isotopes, T, '2026-10-02')[0]; assert.equal(pd.dueDate, '2026-10-02');
pd = M.parseQuickAdd('movie 5pm-8pm', elements, isotopes, T, '2026-10-02')[0]; assert.equal(pd.date, '2026-10-02');
pd = M.parseQuickAdd('dentist', elements, isotopes, T, T)[0]; assert.equal(pd.dueDate, null);
const b = mk({ kind: 'block', title: 'w', start: '09:00', end: '17:00', repeat: { type: 'days', days: [1, 2] } });
assert.equal(M.showsOn(b, new Map(), T, T), true); assert.equal(M.showsOn(b, new Map(), '2026-10-01', T), false);

assert.equal(M.statusFromCount(3, 8), 'partial'); assert.equal(M.statusFromCount(8, 8), 'done');
const a1 = { id: '1', updatedAt: '2026-01-02' }, b1 = { id: '1', updatedAt: '2026-01-03' };
assert.equal(M.mergeRecords([a1], [b1]).changed.length, 1); assert.equal(M.mergeRecords([b1], [a1]).changed.length, 0);
assert.equal(M.describeRepeat(d), 'every Monday, Wednesday & Friday');
assert.equal(M.describeRepeat(mo), 'every month on the 31st');
console.log('model tests passed');
{
  const q = t => M.parseQuickAdd(t, elements, isotopes, T)[0];
  let x = q('do dishes #onetime'); assert.equal(x.kind, 'task'); assert.equal(x.newCategory, null); assert.equal(x.title, 'do dishes');
  x = q('stretch #daily #fitness'); assert.equal(x.kind, 'habit'); assert.equal(x.repeat.type, 'daily'); assert.equal(x.elementId, elements[0].id);
  x = q('call mom #weekly'); assert.deepEqual(x.repeat, { type: 'perWeek', count: 1 });
  x = q('floss #habit'); assert.equal(x.kind, 'habit');
  console.log('keyword tag tests passed');
}
{
  const q = t => M.parseQuickAdd(t, elements, isotopes, T)[0];
  let x = q('move out: pack, clean, return keys #home');
  assert.equal(x.kind, 'task'); assert.equal(x.title, 'move out'); assert.deepEqual(x.items, ['pack', 'clean', 'return keys']); assert.equal(x.elementId, home.id);
  const made = M.makeAtom(x); assert.equal(made.items.length, 3); assert.equal(made.items[0].done, false);
  x = q('lunch 11:30-1pm'); assert.equal(x.kind, 'block'); // colon in a time is not steps
  x = q('study 25 min timer #career'); assert.deepEqual(x.target, { kind: 'timer', minutes: 25 }); assert.equal(x.kind, 'habit'); assert.equal(x.title, 'study');
  x = q('deep work 1h timer weekdays'); assert.deepEqual(x.target, { kind: 'timer', minutes: 60 }); assert.equal(x.repeat.type, 'days'); assert.equal(x.title, 'deep work');
  x = q('read 20 min daily'); assert.equal(x.target.kind, 'check'); assert.equal(x.title, 'read 20 min');
  const b1 = { id: 'a', title: 'work', start: '17:00', end: '23:00' }, b2 = { id: 'b', title: 'movie', start: '20:00', end: '22:00' }, b3 = { id: 'c', title: 'late', start: '23:00', end: '01:00' };
  const c = M.clashes([b1, b2, b3]); assert.deepEqual(c.get('a'), ['movie']); assert.equal(c.has('c'), false);
  const h = M.makeAtom({ kind: 'habit', title: 'h', repeat: { type: 'daily' } }); h.createdAt = '2026-09-01T00:00:00Z';
  const tk = M.makeAtom({ kind: 'task', title: 't', dueDate: '2026-09-28' }); tk.createdAt = '2026-09-01T00:00:00Z';
  const logs = new Map([[h.id, new Map([['2026-09-28', { status: 'done' }], ['2026-09-29', { status: 'done' }]])]]);
  const r = M.weekReview([h, tk], id => logs.get(id) || new Map(), '2026-09-28', T);
  assert.equal(r.days.length, 7); assert.equal(r.days[2].future, true);
  assert.equal(r.habits[0].done, 2); assert.equal(r.habits[0].planned, 2);
  assert.equal(r.slipped.length, 1); assert.equal(r.total, 4); assert.equal(r.done, 2);
  console.log('v0.1.5 model tests passed');
}

// ---------- v0.2.1: expense lists ----------
{
  const q = t => M.parseQuickAdd(t, [], [], '2026-09-29')[0];
  let x = q('car repair : tires $10 brakes $50 labor $40');
  assert.equal(x.kind, 'expense'); assert.equal(x.title, 'car repair');
  assert.deepEqual(x.items.map(i => [i.text, i.cents]), [['tires', 1000], ['brakes', 5000], ['labor', 4000]]);
  assert.equal(M.expenseTotal(x), 10000); assert.equal(M.fmtMoney(M.expenseTotal(x)), '$100');
  x = q('#expense trip: gas 40, hotel $120.99 and food $60');
  assert.deepEqual(x.items.map(i => [i.text, i.cents]), [['gas', 4000], ['hotel', 12099], ['food', 6000]]);
  assert.equal(M.fmtMoney(M.expenseTotal(x)), '$220.99');
  x = q('#expenses rent $1,200'); assert.equal(x.title, 'Expenses'); assert.equal(x.items[0].cents, 120000); assert.equal(x.newCategory, null);
  x = q('move out: pack, clean'); assert.equal(x.kind, 'task'); // no money -> still task steps
  const a = M.makeAtom({ kind: 'expense', title: 'car', items: [{ text: 'tires', cents: 1000 }] });
  assert.equal(M.frequency(a), 'expense'); assert.equal(M.countsToday(a, new Map(), '2026-09-29'), false);
  assert.ok(a.items[0].id);
  console.log('v0.2.1 expense tests passed');
}

// v0.2.4: one day name = one date; plural / "every" = repeats; ongoing tasks; notes
{
  let x = one('buy groceries on Friday');
  assert.equal(x.kind, 'task'); assert.equal(x.dueDate, '2026-10-02'); assert.equal(x.title, 'buy groceries'); assert.equal(x.repeat, null);
  x = one('buy groceries on Fridays'); assert.equal(x.kind, 'habit'); assert.deepEqual(x.repeat, { type: 'days', days: [5] }); assert.equal(x.title, 'buy groceries');
  x = one('buy groceries every friday'); assert.equal(x.kind, 'habit'); assert.deepEqual(x.repeat, { type: 'days', days: [5] }); assert.equal(x.title, 'buy groceries');
  x = one('call mom tuesday'); assert.equal(x.dueDate, T, 'same weekday = today');
  x = one('call mom next tuesday'); assert.equal(x.dueDate, '2026-10-06'); assert.equal(x.title, 'call mom');
  x = one('call mom this fri'); assert.equal(x.dueDate, '2026-10-02'); assert.equal(x.title, 'call mom');
  x = one('#fitness workout monday wednesday friday'); assert.equal(x.kind, 'habit');
  x = one('#habit gym friday'); assert.deepEqual(x.repeat, { type: 'days', days: [5] });
  x = one('pushups x20 sunday'); assert.deepEqual(x.repeat, { type: 'days', days: [0] });
  x = one('dentist 2pm-3pm thursday'); assert.equal(x.kind, 'block'); assert.equal(x.date, '2026-10-01'); assert.equal(x.repeat, null);
  x = one('work 9am-5pm fridays'); assert.deepEqual(x.repeat, { type: 'days', days: [5] }); assert.equal(x.date, null);
  x = one('#ongoing learn spanish'); assert.equal(x.kind, 'task'); assert.equal(x.ongoing, true); assert.equal(x.dueDate, null); assert.equal(x.title, 'learn spanish');
  x = one('#goal run a marathon friday'); assert.equal(x.ongoing, true); assert.equal(x.dueDate, null);
  const g = M.makeAtom(x);
  assert.equal(M.frequency(g), 'ongoing');
  assert.equal(M.showsOn(g, new Map(), T, T), true); assert.equal(M.showsOn(g, new Map(), '2026-10-20', T), true); assert.equal(M.showsOn(g, new Map(), '2026-09-01', T), false);
  assert.equal(M.countsToday(g, new Map(), T), false);
  const gd = { ...g, completedOn: '2026-09-27' };
  assert.equal(M.showsOn(gd, new Map(), T, T), false); assert.equal(M.showsOn(gd, new Map(), T, T, { showDone: true }), true);
  assert.equal(M.showsOn(gd, new Map(), '2026-09-27', T), true);
  x = one('#note books to read: dune, piranesi'); assert.equal(x.kind, 'note'); assert.equal(x.title, 'books to read'); assert.deepEqual(x.items, ['dune', 'piranesi']);
  const n = M.makeAtom(x);
  assert.equal(n.pinned, false); assert.equal(n.items.length, 2); assert.equal(M.showsOn(n, new Map(), T, T), false);
  assert.equal(M.showsOn({ ...n, pinned: true }, new Map(), T, T), true); assert.equal(M.countsToday(n, new Map(), T), false);
  console.log('v0.2.4 day-name, ongoing & note tests passed');
}

// v0.2.4: duplicate categories merge into the oldest one
{
  const a = M.seedRecords(), b = M.seedRecords();
  assert.equal(a.elements[0].id, b.elements[0].id, 'seed ids are fixed');
  const old = { ...M.newRecord('el', { name: 'Fitness' }), createdAt: '2026-09-01T00:00:00Z' };
  const dup = { ...M.newRecord('el', { name: 'fit ness' }), createdAt: '2026-09-10T00:00:00Z' };
  const isoA = M.newRecord('iso', { elementId: old.id, name: 'Cardio' });
  const isoB = M.newRecord('iso', { elementId: dup.id, name: 'cardio' });
  const isoC = M.newRecord('iso', { elementId: dup.id, name: 'Yoga' });
  const item = M.makeAtom({ title: 'run', elementId: dup.id, isotopeId: isoB.id });
  const plan = M.planDedupe([old, dup], [isoA, isoB, isoC], [item]);
  assert.deepEqual(plan.elements.map(e => e.id), [dup.id]); assert.ok(plan.elements[0].deletedAt);
  assert.equal(plan.atoms[0].elementId, old.id); assert.equal(plan.atoms[0].isotopeId, isoA.id);
  assert.ok(plan.isotopes.find(i => i.id === isoB.id).deletedAt);
  assert.equal(plan.isotopes.find(i => i.id === isoC.id).elementId, old.id);
  const again = M.planDedupe([old, plan.elements[0]], [isoA, ...plan.isotopes], plan.atoms);
  assert.equal(again.elements.length + again.isotopes.length + again.atoms.length, 0, 'second run changes nothing');
  console.log('v0.2.4 duplicate category tests passed');
}
