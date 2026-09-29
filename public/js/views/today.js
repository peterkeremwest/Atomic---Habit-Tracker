// TODAY — what's due now, with one-tap checkboxes.
import { S, live, logsFor, elementById, isotopeById } from '../state.js';
import * as M from '../model.js';
import { esc, asciiBar } from '../ui.js';

const MARK = { done: '✓', partial: '~', skipped: '-' };

export function atomRow(a, k, { just = null } = {}) {
  const logs = logsFor(a.id);
  const status = M.statusFor(a, logs, k);
  const el = elementById(a.elementId), iso = isotopeById(a.isotopeId);
  const meta = [];
  if (el) meta.push(`<span class="tag">${esc(el.symbol)}${iso ? '·' + esc(iso.name) : ''}</span>`);
  if (a.kind === 'habit') {
    meta.push(`<span>${esc(M.describeRepeat(a))}</span>`);
    if (a.repeat?.type === 'perWeek') meta.push(`<span>${M.weekDoneCount(a, logs, k)}/${a.repeat.count} this wk</span>`);
    const st = M.streak(a, logs, k);
    if (st.value) meta.push(`<span>streak ${st.value}${st.unit}</span>`);
  } else if (a.dueDate && !a.completedOn) {
    const d = M.fromKey(a.dueDate);
    meta.push(a.dueDate < k ? `<span class="overdue">overdue ${d.getDate()} ${M.MONTHS[d.getMonth()]}</span>` : '');
  }
  if (a.energy) meta.push(`<span>${a.energy}-e</span>`);
  const isCount = a.kind === 'habit' && a.target?.kind === 'count';
  const box = isCount
    ? `[<span class="mark">${logs.get(k)?.count || 0}/${a.target.goal}</span>]`
    : `[<span class="mark">${MARK[status] || '&nbsp;'}</span>]`;
  const label = isCount ? `Add one to ${a.title}` : (status === 'done' ? `Uncheck ${a.title}` : `Check ${a.title}`);
  return `<div class="row ${status === 'done' || status === 'skipped' ? 'done' : ''} ${just === a.id ? 'just' : ''}" data-atom="${a.id}">
    <button class="chk vt ${isCount ? 'count' : ''}" data-action="toggle" data-id="${a.id}" aria-label="${esc(label)}">${box}</button>
    <div class="body">
      <button class="title" data-action="edit" data-id="${a.id}">${esc(a.title)}</button>
      ${meta.filter(Boolean).length ? `<div class="meta">${meta.join('')}</div>` : ''}
    </div>
    <button class="more" data-action="menu" data-id="${a.id}" aria-label="More options">⋯</button>
  </div>`;
}

export function render({ just } = {}) {
  const k = M.todayKey();
  const { filterEl, lowOnly, showDone } = S.ui;
  let atoms = live(S.atoms);
  if (filterEl) atoms = atoms.filter(a => a.elementId === filterEl);
  if (lowOnly) atoms = atoms.filter(a => a.energy === 'low');

  const due = atoms.filter(a => M.isDueToday(a, logsFor(a.id), k) || (a.kind === 'task' && a.completedOn === k));
  const st = a => M.statusFor(a, logsFor(a.id), k);
  const open = due.filter(a => !['done', 'skipped'].includes(st(a)));
  const closed = due.filter(a => ['done', 'skipped'].includes(st(a)));
  const habits = open.filter(a => a.kind === 'habit');
  const tasks = open.filter(a => a.kind === 'task').sort((a, b) => (a.dueDate || '9') < (b.dueDate || '9') ? -1 : 1);

  const counted = due.filter(a => st(a) !== 'skipped');
  const doneN = counted.filter(a => st(a) === 'done').length;
  const pct = counted.length ? Math.round((doneN / counted.length) * 100) : 0;

  const chips = [`<button class="chip vt ${!filterEl ? 'on' : ''}" data-action="filter" data-el="">ALL</button>`]
    .concat(live(S.elements).map(e => `<button class="chip vt ${filterEl === e.id ? 'on' : ''}" data-action="filter" data-el="${e.id}" title="${esc(e.name)}">${esc(e.symbol)}</button>`))
    .concat(`<button class="chip vt ${lowOnly ? 'on' : ''}" data-action="lowonly">LOW-E</button>`);

  const list = (arr, empty) => arr.length ? arr.map(a => atomRow(a, k, { just })).join('') : `<p class="empty">${empty}</p>`;
  const nothingAtAll = !live(S.atoms).length;

  return `
    <div class="progress vt glow" aria-label="${doneN} of ${counted.length} done">
      <span>${asciiBar(doneN, counted.length)}</span><span>${doneN}/${counted.length}</span><span class="dim">${pct}%</span>
    </div>
    <div class="chips" role="toolbar" aria-label="Filter by element">${chips.join('')}</div>
    ${nothingAtAll ? `<div class="empty" style="margin-top:24px">
        <p>&gt; no atoms yet.</p>
        <p>&gt; type one below, e.g.</p>
        <p class="tag">&nbsp;&nbsp;read 20 min daily #Ps</p>
        <p class="tag">&nbsp;&nbsp;gym mon wed fri #Fi.strength</p>
        <p class="tag">&nbsp;&nbsp;water x8 daily #Fi !low</p>
        <p class="tag">&nbsp;&nbsp;renew passport tomorrow #Hm</p>
      </div>` : `
    <div class="section vt"><span>// HABITS</span><span>${habits.length}</span></div>
    ${list(habits, '&gt; all habits handled.')}
    <div class="section vt"><span>// TASKS</span><span>${tasks.length}</span></div>
    ${list(tasks, '&gt; no open tasks.')}
    <div class="section vt"><button data-action="showdone">// DONE (${closed.length}) ${showDone ? '▾' : '▸'}</button></div>
    ${showDone ? list(closed, '&gt; nothing yet.') : ''}`}
  `;
}
