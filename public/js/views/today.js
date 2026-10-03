// TODAY — everything for the chosen day, grouped by how often it repeats. Checked items stay visible.
import { S, live, logsFor, elementById, isotopeById, timerLeft, timerRunning, leftovers } from '../state.js';
import * as M from '../model.js';
import { esc, foldSection } from '../ui.js';

const MARK = { done: '✓', met: '✓', partial: '~', skipped: '–' };

function catLabel(a) {
  const el = elementById(a.elementId), iso = isotopeById(a.isotopeId);
  if (!el || el.deletedAt) return '';
  return `<span class="tag">${esc(M.tagOf(el.name))}${iso && !iso.deletedAt ? ' · ' + esc(iso.name) : ''}</span>`;
}
export const fmtClock = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const handle = (a, drag) => drag ? `<span class="drag" data-drag="${a.id}" aria-hidden="true" title="drag to reorder">⠿</span>` : '';

function steps(a) {
  if (!a.items?.length) return '';
  return `<ul class="items steps">${a.items.map(i => `<li class="${i.done ? 'done' : ''}">
    <button class="chk small vt" data-action="item" data-id="${a.id}" data-item="${i.id}" aria-label="${i.done ? 'Uncheck' : 'Check'} step ${esc(i.text)}" aria-pressed="${i.done}">[<span class="mark">${i.done ? '✓' : '&nbsp;'}</span>]</button>
    <span class="itxt">${esc(i.text)}</span></li>`).join('')}</ul>`;
}

export function atomRow(a, k, { just = null, drag = true } = {}) {
  const logs = logsFor(a.id);
  const real = M.todayKey();
  const future = k > real;
  const status = M.statusFor(a, logs, k);
  const meta = [catLabel(a)];
  const tk = a.target?.kind;
  if (a.kind === 'habit') {
    meta.push(`<span>${esc(M.describeRepeat(a))}</span>`);
    if (tk === 'timer') meta.push(`<span>${a.target.minutes}-minute timer</span>`);
    if (M.isQuota(a)) {
      const unit = a.repeat.type === 'perMonth' ? 'month' : 'week';
      const n = M.periodDoneCount(a, logs, k);
      meta.push(status === 'met' ? `<span>done for this ${unit}</span>` : `<span>${n} of ${a.repeat.count} this ${unit}</span>`);
    }
    const st = M.streakText(M.streak(a, logs, future ? real : k));
    if (st) meta.push(`<span>${st}</span>`);
  } else if (a.kind === 'task') {
    if (a.items?.length) meta.push(`<span>${a.items.filter(i => i.done).length} of ${a.items.length} steps</span>`);
    if (a.completedOn && a.completedOn !== k) meta.push(`<span>done ${M.relativeDay(a.completedOn, real)}</span>`);
    else if (a.dueDate && !a.completedOn && a.dueDate < k) meta.push(`<span class="overdue">overdue since ${M.shortDate(a.dueDate)}</span>`);
  }
  if (a.energy) meta.push(`<span>${a.energy} energy</span>`);

  let box, label, cls = '';
  if (a.kind === 'habit' && tk === 'count') {
    box = `[<span class="mark">${logs.get(k)?.count || 0}/${a.target.goal}</span>]`; label = `Add one to ${a.title}`; cls = 'count';
  } else if (a.kind === 'habit' && tk === 'timer' && status !== 'done' && k === real) {
    const left = timerLeft(a.id);
    const run = timerRunning(a.id);
    box = `[<span class="mark" data-timer="${a.id}">${fmtClock(left ?? a.target.minutes * 60000)}</span>]`;
    label = run ? `Pause timer for ${a.title}` : `Start ${a.target.minutes}-minute timer for ${a.title}`;
    cls = 'count timer' + (run ? ' running' : '');
  } else {
    box = `[<span class="mark">${MARK[status] || '&nbsp;'}</span>]`; label = status === 'done' ? `Uncheck ${a.title}` : `Check ${a.title}`;
  }
  const crossed = status === 'done' || status === 'skipped' || status === 'met';
  const pinned = a.focusOn === k;
  return `<div class="row ${crossed ? 'done' : ''} ${just === a.id ? 'just' : ''}" data-atom="${a.id}">
    <button class="chk vt ${cls}" data-action="toggle" data-id="${a.id}" aria-label="${esc(label)}" aria-pressed="${status === 'done'}" ${future && a.kind === 'habit' ? 'disabled title="can\'t check off a future day"' : ''}>${box}</button>
    <div class="body">
      <button class="title" data-action="edit" data-id="${a.id}">${pinned ? '<span class="pin vt">★</span> ' : ''}${esc(a.title)}</button>
      ${meta.filter(Boolean).length ? `<div class="meta">${meta.filter(Boolean).join('')}</div>` : ''}
      ${a.kind === 'task' ? steps(a) : ''}
    </div>
    ${handle(a, drag)}
    <button class="more" data-action="menu" data-id="${a.id}" aria-label="More options for ${esc(a.title)}">⋯</button>
  </div>`;
}

function blockRow(b, k, clash) {
  const now = M.nowHHMM();
  const overnight = b.end <= b.start;
  const isNow = k === M.todayKey() && (overnight ? (now >= b.start || now < b.end) : (now >= b.start && now < b.end));
  const past = k < M.todayKey() || (k === M.todayKey() && !overnight && now >= b.end);
  const meta = [catLabel(b), b.repeat ? `<span>${esc(M.describeRepeat(b))}</span>` : '',
    clash ? `<span class="overdue">⚠ overlaps ${clash.map(esc).join(', ')}</span>` : ''].filter(Boolean);
  return `<div class="row block ${past ? 'past' : ''} ${isNow ? 'now' : ''}" data-atom="${b.id}">
    <div class="time vt" aria-label="${M.fmtTime(b.start)} to ${M.fmtTime(b.end)}">${M.fmtTime(b.start)}<br><span class="dim">– ${M.fmtTime(b.end)}</span></div>
    <div class="body">
      <button class="title" data-action="edit" data-id="${b.id}">${esc(b.title)}${isNow ? ' <span class="nowtag vt">● NOW</span>' : ''}</button>
      ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
    </div>
    <button class="more" data-action="menu" data-id="${b.id}" aria-label="More options for ${esc(b.title)}">⋯</button>
  </div>`;
}

function listCard(l, k, just, drag = true) {
  const done = l.items.filter(i => i.done).length;
  const all = l.items.length > 0 && done === l.items.length;
  return `<div class="listcard ${all ? 'done' : ''} ${just === l.id ? 'just' : ''}" data-atom="${l.id}">
    <div class="row ${all ? 'done' : ''}" data-atom="${l.id}">
      <button class="chk vt" data-action="toggle" data-id="${l.id}" aria-label="${all ? 'Uncheck all in' : 'Check all in'} ${esc(l.title)}">[<span class="mark">${all ? '✓' : '&nbsp;'}</span>]</button>
      <div class="body">
        <button class="title" data-action="edit" data-id="${l.id}">${l.focusOn === k ? '<span class="pin vt">★</span> ' : ''}${esc(l.title)}</button>
        <div class="meta">${catLabel(l)}<span>${done} of ${l.items.length} checked</span></div>
      </div>
      ${handle(l, drag)}
      <button class="more" data-action="menu" data-id="${l.id}" aria-label="More options for ${esc(l.title)}">⋯</button>
    </div>
    <ul class="items">${l.items.map(i => `<li class="${i.done ? 'done' : ''}">
      <button class="chk small vt" data-action="item" data-id="${l.id}" data-item="${i.id}" aria-label="${i.done ? 'Uncheck' : 'Check'} ${esc(i.text)}" aria-pressed="${i.done}">[<span class="mark">${i.done ? '✓' : '&nbsp;'}</span>]</button>
      <span class="itxt">${esc(i.text)}</span></li>`).join('')}
    </ul>
    <form class="additem" data-form="additem" data-id="${l.id}"><input class="field" name="t" maxlength="80" placeholder="+ add item" aria-label="Add item to ${esc(l.title)}"></form>
  </div>`;
}

// Expense list: every cost with its amount, then the total and a bar showing each cost's share of it.
const SHADES = [1, .55, .3, .78, .42];
const shade = i => `rgba(var(--fg-rgb), ${SHADES[i % SHADES.length]})`;
function expenseCard(l, k, just, drag = true) {
  const total = M.expenseTotal(l);
  const paid = !!l.completedOn;
  const n = l.items.length;
  const pct = c => total > 0 ? Math.round((c / total) * 100) : 0;
  const bar = total > 0 ? `<div class="expbar" role="img" aria-label="${esc(l.items.map(i => `${i.text} ${pct(i.cents)} percent`).join(', '))}">
      ${l.items.map((i, j) => i.cents > 0 ? `<i style="flex-grow:${i.cents};background:${shade(j)}" title="${esc(M.costLine(i))}"></i>` : '').join('')}</div>` : '';
  return `<div class="listcard expcard ${paid ? 'done' : ''} ${just === l.id ? 'just' : ''}" data-atom="${l.id}">
    <div class="row ${paid ? 'done' : ''}" data-atom="${l.id}">
      <button class="chk vt" data-action="toggle" data-id="${l.id}" aria-label="${paid ? 'Mark not paid:' : 'Mark paid:'} ${esc(l.title)}" aria-pressed="${paid}">[<span class="mark">${paid ? '✓' : '&nbsp;'}</span>]</button>
      <div class="body">
        <button class="title" data-action="edit" data-id="${l.id}">${l.focusOn === k ? '<span class="pin vt">★</span> ' : ''}${esc(l.title)}</button>
        <div class="meta">${catLabel(l)}<span>${n} cost${n === 1 ? '' : 's'}</span>${paid ? `<span>paid ${M.relativeDay(l.completedOn, M.todayKey())}</span>` : ''}</div>
      </div>
      ${handle(l, drag)}
      <button class="more" data-action="menu" data-id="${l.id}" aria-label="More options for ${esc(l.title)}">⋯</button>
    </div>
    <ul class="costs">${l.items.map((i, j) => `<li>
      <i class="sw" style="background:${shade(j)}" aria-hidden="true"></i><span class="itxt">${esc(i.text)}</span><span class="lead" aria-hidden="true"></span>
      <span class="amt vt">${M.fmtMoney(i.cents || 0)}</span><span class="share">${pct(i.cents)}%</span></li>`).join('')}
    </ul>
    <div class="exptotal"><span class="vt">TOTAL</span><span class="vt glow">${M.fmtMoney(total)}</span></div>
    ${bar}
    ${paid ? '' : `<form class="additem" data-form="addcost" data-id="${l.id}"><input class="field" name="t" maxlength="120" placeholder="+ add cost, like oil change $30" aria-label="Add cost to ${esc(l.title)}"></form>`}
  </div>`;
}

// A note pinned to Today: its checklist can be ticked and added to right here; the text shows underneath.
export function noteCard(n, { drag = true, where = 'today' } = {}) {
  const items = n.items || [];
  const done = items.filter(i => i.done).length;
  return `<div class="listcard notecard" data-atom="${n.id}">
    <div class="row" data-atom="${n.id}">
      <span class="nmark vt" aria-hidden="true">${n.pinned ? '★' : '¶'}</span>
      <div class="body">
        <button class="title" data-action="edit" data-id="${n.id}">${esc(n.title)}</button>
        ${items.length ? `<div class="meta"><span>${done} of ${items.length} checked</span></div>` : ''}
      </div>
      ${where === 'notes' ? `<button class="btn vt npin ${n.pinned ? 'on' : ''}" data-action="notepin" data-id="${n.id}" aria-pressed="${!!n.pinned}" aria-label="${n.pinned ? 'Remove from Today' : 'Show on Today every day'}">${n.pinned ? '★ TODAY' : '☆ TODAY'}</button>` : ''}
      ${handle(n, drag)}
      <button class="more" data-action="menu" data-id="${n.id}" aria-label="More options for ${esc(n.title)}">⋯</button>
    </div>
    ${items.length ? `<ul class="items">${items.map(i => `<li class="${i.done ? 'done' : ''}">
      <button class="chk small vt" data-action="item" data-id="${n.id}" data-item="${i.id}" aria-label="${i.done ? 'Uncheck' : 'Check'} ${esc(i.text)}" aria-pressed="${i.done}">[<span class="mark">${i.done ? '✓' : '&nbsp;'}</span>]</button>
      <span class="itxt">${esc(i.text)}</span></li>`).join('')}</ul>` : ''}
    ${n.note ? `<p class="ntext">${esc(n.note)}</p>` : ''}
    <form class="additem" data-form="additem" data-id="${n.id}"><input class="field" name="t" maxlength="120" placeholder="+ add to ${esc(n.title)}" aria-label="Add to ${esc(n.title)}"></form>
  </div>`;
}

const SECTIONS = [
  ['focus', 'FOCUS'], ['schedule', 'SCHEDULE'], ['daily', 'DAILY'], ['weekly', 'WEEKLY'], ['monthly', 'MONTHLY'], ['once', 'ONE-TIME'], ['ongoing', 'ONGOING'], ['list', 'LISTS'], ['expense', 'EXPENSES'], ['note', 'NOTES'],
];

export function renderTop() { return dayNav(S.ui.date); }

export function dayNav(k) {
  const real = M.todayKey();
  const sunday = k === real && M.weekday(real) === 0;
  return `<div class="daynav">
    <button class="btn vt" data-action="dateprev" aria-label="Previous day">◀</button>
    <button class="dlabel" data-action="datepick" aria-label="Pick a date. Showing ${M.prettyDate(k)}">
      <span class="vt glow">${M.prettyDate(k)}</span><small>${M.relativeDay(k, real)}${k !== real ? '' : ' · tap to pick a date'}</small></button>
    <button class="btn vt" data-action="datenext" aria-label="Next day">▶</button>
  </div>
  ${k !== real ? `<button class="btn vt backtoday" data-action="gotoday">◀ BACK TO TODAY</button>` : ''}
  ${sunday ? `<button class="btn vt backtoday" data-action="review">IT'S SUNDAY · OPEN YOUR WEEKLY REVIEW ▶</button>` : ''}`;
}

export function render({ just } = {}) {
  const k = S.ui.date;
  const real = M.todayKey();
  const { filterEl, lowOnly } = S.ui;
  let atoms = live(S.atoms);
  if (filterEl) atoms = atoms.filter(a => a.elementId === filterEl);
  if (lowOnly) atoms = atoms.filter(a => a.energy === 'low');
  const showDone = !!S.settings.ongoingShowDone;
  const shown = atoms.filter(a => M.showsOn(a, logsFor(a.id), k, real, { showDone }));

  const counted = shown.filter(a => M.countsToday(a, logsFor(a.id), k));
  const doneN = counted.filter(a => M.statusFor(a, logsFor(a.id), k) === 'done').length;
  const pct = counted.length ? Math.round((doneN / counted.length) * 100) : 0;

  const chips = [`<button class="chip ${!filterEl ? 'on' : ''}" data-action="filter" data-el="">All</button>`]
    .concat(live(S.elements).map(e => `<button class="chip ${filterEl === e.id ? 'on' : ''}" data-action="filter" data-el="${e.id}">${esc(e.name)}</button>`))
    .concat(`<button class="chip ${lowOnly ? 'on' : ''}" data-action="lowonly">Low energy</button>`);

  const bySection = new Map(SECTIONS.map(([key]) => [key, []]));
  for (const a of shown) bySection.get(a.focusOn === k && a.kind !== 'block' && a.kind !== 'note' ? 'focus' : M.frequency(a)).push(a);
  bySection.get('schedule').sort((x, y) => x.start.localeCompare(y.start));
  const clash = M.clashes(bySection.get('schedule'));

  const finishedOngoing = k === real ? atoms.filter(a => a.kind === 'task' && a.ongoing && a.completedOn && a.completedOn !== k).length : 0;
  const body = SECTIONS.filter(([key]) => bySection.get(key).length || (key === 'ongoing' && finishedOngoing)).map(([key, label]) => {
    const list = bySection.get(key);
    const n = key === 'schedule' ? list.length
      : key === 'expense' ? `${M.fmtMoney(list.reduce((t, a) => t + M.expenseTotal(a), 0))} total`
      : key === 'note' ? list.length : `${list.filter(a => ['done', 'met'].includes(M.statusFor(a, logsFor(a.id), k))).length} of ${list.length}`;
    let rows = list.map(a => key === 'schedule' ? blockRow(a, k, clash.get(a.id))
      : a.kind === 'note' ? noteCard(a) : a.kind === 'list' ? listCard(a, k, just) : a.kind === 'expense' ? expenseCard(a, k, just) : atomRow(a, k, { just })).join('');
    if (key === 'ongoing' && k === real) {
      if (finishedOngoing) rows += `<button class="btn vt moveleft" data-action="ongoingdone">${showDone ? 'HIDE FINISHED ONES' : `SHOW ${finishedOngoing} FINISHED`}</button>`;
    }
    if (key === 'once' && k === real) {
      const left = leftovers(k).filter(a => a.focusOn !== k).length;
      if (left) rows += `<button class="btn vt moveleft" data-action="moveleft">MOVE ${left} UNFINISHED TO TOMORROW ▶</button>`;
    }
    const title = key === 'focus' ? `FOCUS <small class="dim">(${list.length} of 3 pinned)</small>` : label;
    return foldSection('today:' + key, title, n, rows, S.ui.folded.has('today:' + key));
  }).join('');

  const nothingAtAll = !live(S.atoms).length;
  return `
    <div class="progress" aria-label="${doneN} of ${counted.length} done">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span class="vt glow">${counted.length ? `${doneN} of ${counted.length} done` : 'nothing due'}</span>
    </div>
    <div class="chips" role="toolbar" aria-label="Filter by category">${chips.join('')}</div>
    ${nothingAtAll ? `<p class="empty" style="margin-top:16px">&gt; nothing here yet. type in the box above, or tap <span class="vt">?</span> for examples.</p>`
      : (body || `<p class="empty" style="margin-top:20px">&gt; nothing for ${k === real ? 'today' : 'this day'}${filterEl || lowOnly ? ' with this filter' : ''}.</p>`)}
  `;
}
