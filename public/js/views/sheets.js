// Bottom sheets: item editor, long-press menu, rename category, quick-add help.
import { S, live, isotopesOf } from '../state.js';
import * as A from '../state.js';
import * as M from '../model.js';
import { esc, openSheet, closeSheet, toast } from '../ui.js';

const radio = (name, value, label, checked) =>
  `<label><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
const dayBoxes = (name, days) => [1, 2, 3, 4, 5, 6, 0].map(d =>
  `<label><input type="checkbox" name="${name}" value="${d}" ${days.includes(d) ? 'checked' : ''}><span>${M.DAY_SHORT[d]}</span></label>`).join('');
const checkedDays = (f, name) => [...f.querySelectorAll(`input[name=${name}]:checked`)].map(x => +x.value).sort();

// repeat choice shown in the editor
function repeatChoice(r) {
  if (!r || r.type === 'daily') return 'daily';
  return r.type; // days | perWeek | perMonth | monthDay
}

export function openEditor(atomId = null, preset = {}) {
  const a = atomId ? S.atoms.find(x => x.id === atomId) : null;
  const v = a || { kind: 'task', title: '', elementId: S.ui.filterEl, isotopeId: null, repeat: null, target: { kind: 'check' },
    dueDate: null, energy: null, note: '', start: '09:00', end: '10:00', date: M.todayKey(), items: [], ...preset };
  const r = v.repeat || { type: 'daily' };
  const rc = v.kind === 'habit' ? repeatChoice(v.repeat) : 'daily';
  const hDays = r.type === 'days' ? r.days : [1, 3, 5];
  const bDays = v.kind === 'block' && v.repeat?.type === 'days' ? v.repeat.days : [1, 2, 3, 4, 5];
  const bRep = v.kind === 'block' ? (v.repeat ? (v.repeat.type === 'daily' ? 'daily' : 'days') : 'once') : 'once';
  const isoOpts = elId => `<option value="">none</option>` + (elId ? isotopesOf(elId).map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('') : '');
  const itemsText = (v.items || []).map(i => (typeof i === 'string' ? i : v.kind === 'expense' ? M.costLine(i) : i.text)).join('\n');

  openSheet(`<h2>${a ? 'EDIT' : 'NEW'}</h2>
  <form class="form" id="atomForm" autocomplete="off">
    <label>TYPE</label>
    <div class="seg">${radio('kind', 'task', 'ONE-TIME', v.kind === 'task')}${radio('kind', 'habit', 'HABIT', v.kind === 'habit')}${radio('kind', 'block', 'TIME BLOCK', v.kind === 'block')}${radio('kind', 'list', 'LIST', v.kind === 'list')}${radio('kind', 'expense', 'EXPENSES', v.kind === 'expense')}</div>
    <label for="f-title">TITLE</label>
    <input class="field" id="f-title" name="title" maxlength="120" required value="${esc(v.title)}">
    <label for="f-el">CATEGORY</label>
    <select class="field" id="f-el" name="elementId"><option value="">none</option>
      ${live(S.elements).map(e => `<option value="${e.id}" ${e.id === v.elementId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
    <label for="f-iso">SUBCATEGORY</label>
    <select class="field" id="f-iso" name="isotopeId">${isoOpts(v.elementId)}</select>

    <div data-show="habit">
      <label>HOW OFTEN</label>
      <div class="seg">${radio('rtype', 'daily', 'EVERY DAY', rc === 'daily')}${radio('rtype', 'days', 'ON CERTAIN DAYS', rc === 'days')}${radio('rtype', 'perWeek', 'TIMES A WEEK', rc === 'perWeek')}${radio('rtype', 'perMonth', 'TIMES A MONTH', rc === 'perMonth')}${radio('rtype', 'monthDay', 'DAY OF MONTH', rc === 'monthDay')}</div>
      <div class="seg" data-show-r="days" style="margin-top:8px">${dayBoxes('days', hDays)}</div>
      <div data-show-r="perWeek" style="margin-top:8px"><select class="field" name="perWeek" aria-label="Times per week" style="max-width:200px">
        ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${r.type === 'perWeek' && r.count === n ? 'selected' : ''}>${n === 1 ? 'once' : n + ' times'} a week</option>`).join('')}</select></div>
      <div data-show-r="perMonth" style="margin-top:8px"><select class="field" name="perMonth" aria-label="Times per month" style="max-width:200px">
        ${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}" ${r.type === 'perMonth' && r.count === n ? 'selected' : ''}>${n === 1 ? 'once' : n + ' times'} a month</option>`).join('')}</select></div>
      <div data-show-r="monthDay" style="margin-top:8px"><select class="field" name="monthDay" aria-label="Day of the month" style="max-width:200px">
        ${Array.from({ length: 31 }, (_, i) => i + 1).map(n => `<option value="${n}" ${r.type === 'monthDay' && r.day === n ? 'selected' : ''}>on the ${M.ordinal(n)}</option>`).join('')}</select></div>
      <label>MARK DONE WITH</label>
      <div class="seg">${radio('tkind', 'check', 'A CHECKMARK', !['count', 'timer'].includes(v.target?.kind))}${radio('tkind', 'count', 'A COUNTER', v.target?.kind === 'count')}${radio('tkind', 'timer', 'A TIMER', v.target?.kind === 'timer')}</div>
      <div data-show-t="timer" style="margin-top:8px">
        <label for="f-min" style="margin-top:0">MINUTES</label>
        <input class="field" type="number" id="f-min" name="minutes" min="1" max="600" value="${v.target?.minutes || 25}" style="max-width:120px">
      </div>
      <div data-show-t="count" style="margin-top:8px">
        <label for="f-goal" style="margin-top:0">GOAL PER DAY</label>
        <input class="field" type="number" id="f-goal" name="goal" min="2" max="99" value="${v.target?.goal || 8}" style="max-width:120px">
      </div>
    </div>

    <div data-show="task">
      <label for="f-due">DUE DATE (optional)</label>
      <input class="field" type="date" id="f-due" name="dueDate" value="${v.dueDate || ''}">
    </div>

    <div data-show="block">
      <div class="inline" style="margin-top:0">
        <div style="flex:1"><label for="f-start">FROM</label><input class="field" type="time" id="f-start" name="start" value="${v.start || '09:00'}"></div>
        <div style="flex:1"><label for="f-end">TO</label><input class="field" type="time" id="f-end" name="end" value="${v.end || '10:00'}"></div>
      </div>
      <label>WHEN</label>
      <div class="seg">${radio('brep', 'once', 'ONE DAY', bRep === 'once')}${radio('brep', 'daily', 'EVERY DAY', bRep === 'daily')}${radio('brep', 'days', 'ON CERTAIN DAYS', bRep === 'days')}</div>
      <div data-show-b="once" style="margin-top:8px"><input class="field" type="date" name="bdate" aria-label="Date" value="${v.date || M.todayKey()}" style="max-width:200px"></div>
      <div class="seg" data-show-b="days" style="margin-top:8px">${dayBoxes('bdays', bDays)}</div>
    </div>

    <div data-show="list task expense">
      <label for="f-items"><span data-lbl="list">ITEMS — one per line</span><span data-lbl="task">STEPS (optional) — one per line</span><span data-lbl="expense">COSTS — one per line, like tires $10</span></label>
      <textarea class="field" id="f-items" name="items" rows="5" maxlength="2000">${esc(itemsText)}</textarea>
    </div>

    <div data-show-not="block list expense">
      <label>ENERGY NEEDED</label>
      <div class="seg">${radio('energy', '', 'ANY', !v.energy)}${radio('energy', 'low', 'LOW', v.energy === 'low')}${radio('energy', 'high', 'HIGH', v.energy === 'high')}</div>
    </div>
    <label for="f-note">NOTE</label>
    <textarea class="field" id="f-note" name="note" rows="2" maxlength="500">${esc(v.note || '')}</textarea>

    <div class="actions">
      ${a ? `<button type="button" class="btn vt warn" data-x="delete" style="margin-right:auto">DELETE</button>` : ''}
      <button type="button" class="btn vt" data-x="cancel">CANCEL</button>
      <button type="submit" class="btn solid vt">SAVE</button>
    </div>
  </form>`, root => {
    const f = root.querySelector('#atomForm');
    const sync = () => {
      const kind = f.kind.value;
      root.querySelectorAll('[data-show]').forEach(n => n.classList.toggle('hidden', !n.dataset.show.split(' ').includes(kind)));
      root.querySelectorAll('[data-lbl]').forEach(n => n.classList.toggle('hidden', n.dataset.lbl !== kind));
      root.querySelectorAll('[data-show-not]').forEach(n => n.classList.toggle('hidden', n.dataset.showNot.split(' ').includes(kind)));
      root.querySelectorAll('[data-show-r]').forEach(n => n.classList.toggle('hidden', n.dataset.showR !== f.rtype.value));
      root.querySelectorAll('[data-show-t]').forEach(n => n.classList.toggle('hidden', n.dataset.showT !== f.tkind.value));
      root.querySelectorAll('[data-show-b]').forEach(n => n.classList.toggle('hidden', n.dataset.showB !== f.brep.value));
    };
    f.addEventListener('change', e => {
      if (e.target.name === 'elementId') f.isotopeId.innerHTML = isoOpts(e.target.value);
      sync();
    });
    if (v.isotopeId) f.isotopeId.value = v.isotopeId;
    sync();
    if (!a) setTimeout(() => f.title.focus(), 50);
    root.querySelector('[data-x="cancel"]').onclick = closeSheet;
    root.querySelector('[data-x="delete"]')?.addEventListener('click', async () => {
      await A.undoable('delete', () => A.deleteAtom(a.id)); closeSheet(); toast('deleted', { undo: true });
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const kind = f.kind.value;
      const data = {
        title: f.title.value.trim(), kind,
        elementId: f.elementId.value || null, isotopeId: f.isotopeId.value || null,
        energy: ['block', 'list', 'expense'].includes(kind) ? null : (f.energy.value || null),
        note: f.note.value.trim(),
        repeat: null, target: { kind: 'check' }, dueDate: null, date: null, start: null, end: null,
      };
      if (!data.title) return;
      if (kind === 'habit') {
        const rt = f.rtype.value;
        if (rt === 'days') {
          const ds = checkedDays(f, 'days');
          if (!ds.length) return toast('pick at least one day');
          data.repeat = ds.length === 7 ? { type: 'daily' } : { type: 'days', days: ds };
        } else if (rt === 'perWeek') data.repeat = { type: 'perWeek', count: +f.perWeek.value };
        else if (rt === 'perMonth') data.repeat = { type: 'perMonth', count: +f.perMonth.value };
        else if (rt === 'monthDay') data.repeat = { type: 'monthDay', day: +f.monthDay.value };
        else data.repeat = { type: 'daily' };
        if (f.tkind.value === 'count') data.target = { kind: 'count', goal: Math.min(99, Math.max(2, +f.goal.value || 2)) };
        if (f.tkind.value === 'timer') data.target = { kind: 'timer', minutes: Math.min(600, Math.max(1, +f.minutes.value || 25)) };
      }
      if (kind === 'task') data.dueDate = f.dueDate.value || null;
      if (kind === 'block') {
        if (!f.start.value || !f.end.value) return toast('set a start and end time');
        data.start = f.start.value; data.end = f.end.value;
        const br = f.brep.value;
        if (br === 'once') data.date = f.bdate.value || M.todayKey();
        else if (br === 'daily') data.repeat = { type: 'daily' };
        else {
          const ds = checkedDays(f, 'bdays');
          if (!ds.length) return toast('pick at least one day');
          data.repeat = ds.length === 7 ? { type: 'daily' } : { type: 'days', days: ds };
        }
      }
      if (kind === 'expense') {
        const old = a?.kind === 'expense' ? a.items : [];
        data.items = f.items.value.split('\n').flatMap(line => M.parseCostLine(line.trim()))
          .map(c => ({ ...c, id: (old.find(i => i.text === c.text) || {}).id || M.uid('li') }));
        data.completedOn = a?.kind === 'expense' ? a.completedOn : null;
      }
      if (kind === 'list' || kind === 'task') {
        const lines = f.items.value.split('\n').map(s => s.trim()).filter(Boolean);
        const old = (a?.items || []);
        data.items = lines.map(text => old.find(i => i.text === text) || { id: M.uid('li'), text, done: false });
        const all = data.items.length && data.items.every(i => i.done);
        if (kind === 'list') data.completedOn = all ? (a?.completedOn || M.todayKey()) : null;
        else if (data.items.length && all && !a?.completedOn) data.completedOn = M.todayKey();
      }
      await A.undoable('edit', async () => {
        if (a) {
          if (a.kind !== kind) { data.completedOn = null; }
          await A.updateAtom(a.id, data);
        } else await A.addAtom(data);
      });
      closeSheet(); toast(a ? 'saved' : 'added', { undo: true });
    });
  });
}

export function openMenu(atomId) {
  const a = S.atoms.find(x => x.id === atomId);
  if (!a) return;
  const k = S.ui.date;
  const future = k > M.todayKey();
  const s = M.statusFor(a, A.logsFor(a.id), k);
  const items = [];
  if (a.kind === 'task') {
    items.push(['toggle', a.completedOn ? 'Mark not done' : 'Mark done']);
    if (!a.completedOn) items.push(['snooze', 'Move to tomorrow']);
  } else if (a.kind === 'expense') {
    items.push(['toggle', a.completedOn ? 'Mark not paid' : 'Mark paid']);
  } else if (a.kind === 'list') {
    items.push(['toggle', a.completedOn ? 'Uncheck everything' : 'Check everything']);
    if (a.items.some(i => i.done)) items.push(['cleardone', 'Remove checked items']);
  } else if (a.kind === 'habit' && future) {
    // future days: nothing to check off yet
  } else if (a.kind === 'habit' && a.target?.kind === 'count') {
    items.push(['plus', 'Add one'], ['minus', 'Remove one'], ['skip', 'Skip today (keeps your streak)'], ['clear', 'Reset today']);
  } else if (a.kind === 'habit') {
    if (a.target?.kind === 'timer' && A.timerLeft(a.id) !== null) items.push(['treset', 'Reset timer']);
    if (s !== 'done') items.push(['done', 'Mark done']);
    if (s !== 'partial') items.push(['partial', 'Partly done']);
    if (s !== 'skipped') items.push(['skip', 'Skip today (keeps your streak)']);
    if (s && s !== 'met') items.push(['clear', 'Clear today']);
  }
  if (a.kind !== 'block') items.push(['focus', a.focusOn === k ? 'Unpin from focus' : `Pin to focus${k === M.todayKey() ? '' : ' for this day'} (${A.focusCount(k)} of 3)`]);
  items.push(['edit', a.kind === 'task' && !a.items?.length ? 'Edit / add steps' : 'Edit'], ['delete', 'Delete']);
  const when = k === M.todayKey() ? '' : `<p class="dim" style="margin:-6px 0 8px;font-size:13px">for ${M.prettyDate(k)}</p>`;
  openSheet(`<h2>${esc(a.title)}</h2>${when}<div class="menu">${items.map(([x, l]) =>
    `<button data-x="${x}" class="${x === 'delete' ? 'warn' : ''}">${esc(l)}</button>`).join('')}</div>`, root => {
    root.querySelector('.menu').addEventListener('click', async e => {
      const x = e.target.closest('button')?.dataset.x;
      if (!x) return;
      if (x === 'edit') return openEditor(a.id);
      closeSheet();
      if (x === 'treset') return A.timerReset(a.id);
      if (x === 'focus') {
        const r = await A.undoable('focus', () => A.toggleFocus(a.id, k));
        return toast(r === 'full' ? 'focus already has 3 items, unpin one first' : r === 'pinned' ? 'pinned to focus' : 'unpinned', r === 'full' ? {} : { undo: true });
      }
      const msg = await A.undoable(x, async () => {
        if (x === 'delete') { await A.deleteAtom(a.id); return 'deleted'; }
        if (x === 'toggle') { await A.toggle(a.id, k); return 'updated'; }
        if (x === 'done') { await A.setStatus(a.id, k, 'done'); return 'marked done'; }
        if (x === 'snooze') { await A.snooze(a.id); return 'moved to tomorrow'; }
        if (x === 'partial') { await A.setStatus(a.id, k, 'partial'); return 'marked partly done'; }
        if (x === 'skip') { await A.setStatus(a.id, k, 'skipped'); return 'skipped, streak is safe'; }
        if (x === 'clear') { await A.setStatus(a.id, k, null); return 'cleared'; }
        if (x === 'plus') { await A.bump(a.id, k, +1); return 'added one'; }
        if (x === 'minus') { await A.bump(a.id, k, -1); return 'removed one'; }
        if (x === 'cleardone') { await A.updateAtom(a.id, { items: a.items.filter(i => !i.done), completedOn: null }); return 'checked items removed'; }
      });
      if (msg) toast(msg, { undo: true });
    });
  });
}

export function openRenameCategory(id) {
  const e = A.elementById(id);
  if (!e) return;
  openSheet(`<h2>RENAME CATEGORY</h2>
    <form class="form" id="catForm" autocomplete="off">
      <label for="c-name">NAME</label>
      <input class="field" id="c-name" name="t" maxlength="30" required value="${esc(e.name)}">
      <p class="dim" style="font-size:13px">its tag becomes <span class="tag" id="c-tag">${esc(M.tagOf(e.name))}</span></p>
      <div class="actions"><button type="button" class="btn vt" data-x="cancel">CANCEL</button><button type="submit" class="btn solid vt">SAVE</button></div>
    </form>`, root => {
    const f = root.querySelector('#catForm');
    f.t.addEventListener('input', () => { root.querySelector('#c-tag').textContent = M.tagOf(f.t.value || '…'); });
    root.querySelector('[data-x="cancel"]').onclick = closeSheet;
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = A.validCategoryName(f.t.value, e.id);
      if (err) return toast(err);
      await A.updateElement(e.id, { name: f.t.value.trim() });
      closeSheet(); toast('renamed');
    });
  });
}

export function openHelp() {
  const ex = (code, what) => `<div class="kv"><span class="tag">${esc(code)}</span><span>${what}</span></div>`;
  openSheet(`<h2>WHAT YOU CAN TYPE</h2>
    <div class="help">
      <p class="dim">plain text makes a one-time task. add words to change what it becomes:</p>
      ${ex('#fitness', 'category (new ones are created)')}
      ${ex('#fitness/cardio', 'category + subcategory')}
      ${ex('daily', 'habit, every day')}
      ${ex('monday wednesday friday', 'habit on those days')}
      ${ex('weekdays · weekends', 'habit on those days')}
      ${ex('3x a week · weekly', 'habit, any days of the week')}
      ${ex('2x a month · monthly', 'habit, any days of the month')}
      ${ex('monthly 1st', 'habit on that day of the month')}
      ${ex('x8', 'counter habit: 8 a day')}
      ${ex('today · tomorrow', 'due date for a task')}
      ${ex('!low · !high', 'energy needed')}
      ${ex('5pm-8pm · 9:30am to 1pm', 'time block (today)')}
      ${ex('#timeblock date 2pm-7pm, movie 5pm-8pm', 'several time blocks')}
      ${ex('work 9am-5pm weekdays', 'repeating time block')}
      ${ex('#list groceries: eggs, soap, juice', 'checklist')}
      ${ex('car repair: tires $10, brakes $50', 'expense list with a total')}
      ${ex('#expense lunch $12', 'adds a cost to your Expenses list')}
      <p class="dim">adding to a list that's still open adds the new items to it. the same goes for expense lists.</p>
      <div class="actions"><button class="btn solid vt" data-x="ok">GOT IT</button></div>
    </div>`, root => { root.querySelector('[data-x="ok"]').onclick = closeSheet; });
}

// SEARCH — every item, any day. Tap a result to open its day (or edit it).
export function openSearch(onPick) {
  openSheet(`<h2>SEARCH</h2>
    <input class="field" id="q-search" type="search" placeholder="search titles, steps, list items, notes…" aria-label="Search" autocomplete="off">
    <div id="q-results" class="results" role="list"></div>`, root => {
    const input = root.querySelector('#q-search'), out = root.querySelector('#q-results');
    const kindName = { task: 'one-time', habit: 'habit', block: 'time block', list: 'list', expense: 'expense list' };
    const run = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { out.innerHTML = '<p class="dim" style="font-size:13px">start typing.</p>'; return; }
      const hits = live(S.atoms).filter(a => [a.title, a.note, ...(a.items || []).map(i => i.text)].some(t => (t || '').toLowerCase().includes(q))).slice(0, 40);
      out.innerHTML = hits.length ? hits.map(a => {
        const el = A.elementById(a.elementId);
        const when = a.kind === 'task' ? (a.completedOn ? `done ${M.shortDate(a.completedOn)}` : a.dueDate ? `due ${M.shortDate(a.dueDate)}` : 'no date')
          : a.kind === 'block' ? (a.date ? `${M.shortDate(a.date)} ${M.fmtTime(a.start)}` : `${M.describeRepeat(a)} ${M.fmtTime(a.start)}`)
          : a.kind === 'habit' ? M.describeRepeat(a) : a.kind === 'expense' ? `total ${M.fmtMoney(M.expenseTotal(a))}${a.completedOn ? ' · paid ' + M.shortDate(a.completedOn) : ''}` : a.completedOn ? `finished ${M.shortDate(a.completedOn)}` : 'open';
        return `<button class="hit" data-id="${a.id}" role="listitem"><span>${esc(a.title)}</span>
          <small>${kindName[a.kind]}${el && !el.deletedAt ? ' · ' + esc(M.tagOf(el.name)) : ''} · ${esc(when)}</small></button>`;
      }).join('') : '<p class="dim">no matches.</p>';
    };
    input.addEventListener('input', run);
    out.addEventListener('click', e => {
      const b = e.target.closest('.hit'); if (!b) return;
      const a = S.atoms.find(x => x.id === b.dataset.id);
      closeSheet();
      const today = M.todayKey();
      const date = a.kind === 'task' ? (a.completedOn || (a.dueDate && a.dueDate > today ? a.dueDate : today))
        : a.kind === 'block' ? a.date : ['list', 'expense'].includes(a.kind) ? (a.completedOn || today) : null;
      onPick(a, date);
    });
    run(); setTimeout(() => input.focus(), 50);
  });
}
