import assert from 'node:assert/strict';
import * as M from '../public/js/model.js';
const { elements, isotopes } = M.seedRecords();
const T = '2026-09-29'; // Tuesday
let p = M.parseQuickAdd('gym mon wed fri #Fi.str', elements, isotopes, T);
assert.equal(p.kind,'habit'); assert.deepEqual(p.repeat,{type:'days',days:[1,3,5]}); assert.equal(p.title,'gym');
assert.equal(p.elementId, elements[0].id); assert.equal(p.isotopeId, isotopes[0].id);
p = M.parseQuickAdd('water x8 daily', elements, isotopes, T);
assert.deepEqual(p.target,{kind:'count',goal:8}); assert.equal(p.kind,'habit');
p = M.parseQuickAdd('run 3x #fi !low', elements, isotopes, T);
assert.deepEqual(p.repeat,{type:'perWeek',count:3}); assert.equal(p.energy,'low');
p = M.parseQuickAdd('renew passport tomorrow #Hm', elements, isotopes, T);
assert.equal(p.kind,'task'); assert.equal(p.dueDate,'2026-09-30'); assert.equal(p.title,'renew passport');
p = M.parseQuickAdd('#Zz thing', elements, isotopes, T); assert.equal(p.title,'#Zz thing');
assert.equal(M.weekday(T),2); assert.equal(M.weekStart(T),'2026-09-28'); assert.equal(M.addDays('2026-12-31',1),'2027-01-01');
// streaks
const h = M.makeAtom({kind:'habit',title:'x',repeat:{type:'daily'}}); h.createdAt='2026-09-01T00:00:00Z';
const L = new Map([['2026-09-28',{status:'done'}],['2026-09-27',{status:'skipped'}],['2026-09-26',{status:'done'}],['2026-09-24',{status:'done'}]]);
assert.deepEqual(M.streak(h,L,T),{value:2,unit:'d'}); // today open, 28 done, 27 skip bridges, 26 done, 25 missing -> break
L.set(T,{status:'done'}); assert.equal(M.streak(h,L,T).value,3);
const d = M.makeAtom({kind:'habit',title:'y',repeat:{type:'days',days:[1,3,5]}}); d.createdAt='2026-09-01T00:00:00Z';
assert.equal(M.isScheduled(d,T),false);
const L2=new Map([['2026-09-28',{status:'done'}],['2026-09-25',{status:'done'}],['2026-09-23',{status:'done'}]]);
assert.equal(M.streak(d,L2,T).value,3);
const w = M.makeAtom({kind:'habit',title:'z',repeat:{type:'perWeek',count:2}}); w.createdAt='2026-09-01T00:00:00Z';
const L3=new Map([['2026-09-28',{status:'done'}],['2026-09-22',{status:'done'}],['2026-09-24',{status:'done'}]]);
assert.equal(M.isDueToday(w,L3,T),true); L3.set('2026-09-29',{status:'done'});
assert.equal(M.streak(w,L3,T).value,2); assert.equal(M.isDueToday(w,new Map([['2026-09-28',{status:'done'}],['2026-09-27',{status:'done'}]]),T),true);
const w2=new Map([['2026-09-28',{status:'done'}],['2026-09-30',{status:'done'}]]);
assert.equal(M.isDueToday(w,new Map([['2026-09-28',{status:'done'}],['2026-10-01',{status:'done'}]]),'2026-10-02'),false);
const t = M.makeAtom({kind:'task',title:'a',dueDate:'2026-10-05'}); assert.equal(M.isDueToday(t,new Map(),T),false);
t.dueDate='2026-09-20'; assert.equal(M.isDueToday(t,new Map(),T),true);
assert.equal(M.statusFromCount(3,8),'partial'); assert.equal(M.statusFromCount(8,8),'done');
const a={id:'1',updatedAt:'2026-01-02'}, b={id:'1',updatedAt:'2026-01-03'};
assert.equal(M.mergeRecords([a],[b]).changed.length,1); assert.equal(M.mergeRecords([b],[a]).changed.length,0);
assert.equal(M.describeRepeat(d),'MO WE FR');
console.log('model tests passed');
