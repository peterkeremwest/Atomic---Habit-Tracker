// TODAY — everything for today, grouped by how often it repeats. Checked items stay visible.
import { S, live, logsFor, elementById, isotopeById } from '../state.js';
import * as M from '../model.js';
import { esc } from '../ui.js';

const MARK = { done: '✓', met: '✓', partial: '~', skipped: '–' };

function catLabel(a) {
  const el = elementById(a.elementId), iso = isotopeById(a.isotopeId);
  if (!el || el.deletedAt) return '';
  return `<span class="tag">${esc(M.tagOf(el.name))}${iso && !iso.deletedAt ? ' · ' + esc(iso.name) : ''}</span>`;
}

export function atomRow(a, k, { just = null } = {}) {
  const logs = logsFor(a.id);
  const real = M.todayKey();
  const future = k > real;
  const status = M.statusFor(a, logs, k);
  const meta = [catLabel(a)];
  if (a.kind === 'habit') {
    meta.push(`<span>${esc(M.describeRepeat(a))}</span>`);
    if (M.isQuota(a)) {
      const unit = a.repeat.type === 'perMonth' ? 'month' : 'week';
      const n = M.periodDoneCount(a, logs, k);
      meta.push(status === 'met' ? `<span>done for this ${unit}</span>` : `<span>${n} of ${a.repeat.count} this ${unit}</span>`);
    }
    const st = M.streakText(M.streak(a, logs, future ? real : k));
    if (st) meta.push(`<span>${st}</span>`);
  } else if (a.kind === 'task' && a.completedOn && a.completedOn !== k) {
    meta.push(`<span>done ${M.relativeDay(a.completedOn, real)}</span>`);
  } else if (a.kind === 'task' && a.dueDate && !a.completedOn && a.dueDate < k) {
    meta.push(`<span class="overdue">overdue since ${M.shortDate(a.dueDate)}</span>`);
  }
  if (a.energy) meta.push(`<span>${a.energy} energy</span>`);
  const isCount = a.kind === 'habit' && a.target?.kind === 'count';
  const box = isCount
    ? `[<span class="mark">${logs.get(k)?.count || 0}/${a.target.goal}</span>]`
    : `[<span class="mark">${MARK[status] || '&nbsp;'}</span>]`;
  const label = isCount ? `Add one to ${a.title}` : (status === 'done' ? `Uncheck ${a.title}` : `Check ${a.title}`);
  const crossed = status === 'done' || status === 'skipped' || status === 'met';
  return `<div class="row ${crossed ? 'done' : ''} ${just === a.id ? 'just' : ''}" data-atom="${a.id}">
    <button class="chk vt ${isCount ? 'count' : ''}" data-action="toggle" data-id="${a.id}" aria-label="${esc(label)}" aria-pressed="${status === 'done'}" ${future && a.kind === 'habit' ? 'disabled title="can\'t check off a future day"' : ''}>${box}</button>
    <div class="body">
      <button class="title" data-action="edit" data-id="${a.id}">${esc(a.title)}</button>
      ${meta.filter(Boolean).length ? `<div class="meta">${meta.filter(Boolean).join('')}</div>` : ''}
    </div>
    <button class="more" data-action="menu" data-id="${a.id}" aria-label="More options for ${esc(a.title)}">⋯</button>
  </div>`;
}

function blockRow(b, k) {
  const now = M.nowHHMM();
  const overnight = b.end <= b.start;
  const isNow = k === M.todayKey() && (overnight ? (now >= b.start || now < b.end) : (now >= b.start && now < b.end));
  const past = k < M.todayKey() || (k === M.todayKey() && !overnight && now >= b.end);
  const meta = [catLabel(b), b.repeat ? `<span>${esc(M.describeRepeat(b))}</span>` : ''].filter(Boolean);
  return `<div class="row block ${past ? 'past' : ''} ${isNow ? 'now' : ''}" data-atom="${b.id}">
    <div class="time vt" aria-label="${M.fmtTime(b.start)} to ${M.fmtTime(b.end)}">${M.fmtTime(b.start)}<br><span class="dim">– ${M.fmtTime(b.end)}</span></div>
    <div class="body">
      <button class="title" data-action="edit" data-id="${b.id}">${esc(b.title)}${isNow ? ' <span class="nowtag vt">● NOW</span>' : ''}</button>
      ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
    </div>
    <button class="more" data-action="menu" data-id="${b.id}" aria-label="More options for ${esc(b.title)}">⋯</button>
  </div>`;
}

function listCard(l, k, just) {
  const done = l.items.filter(i => i.done).length;
  const all = l.items.length > 0 && done === l.items.length;
  return `<div class="listcard ${all ? 'done' : ''} ${just === l.id ? 'just' : ''}" data-atom="${l.id}">
    <div class="row ${all ? 'done' : ''}" data-atom="${l.id}">
      <button class="chk vt" data-action="toggle" data-id="${l.id}" aria-label="${all ? 'Uncheck all in' : 'Check all in'} ${esc(l.title)}">[<span class="mark">${all ? '✓' : '&nbsp;'}</span>]</button>
      <div class="body">
        <button class="title" data-action="edit" data-id="${l.id}">${esc(l.title)}</button>
        <div class="meta">${catLabel(l)}<span>${done} of ${l.items.length} checked</span></div>
      </div>
      <button class="more" data-action="menu" data-id="${l.id}" aria-label="More options for ${esc(l.title)}">⋯</button>
    </div>
    <ul class="items">${l.items.map(i => `<li class="${i.done ? 'done' : ''}">
      <button class="chk small vt" data-action="item" data-id="${l.id}" data-item="${i.id}" aria-label="${i.done ? 'Uncheck' : 'Check'} ${esc(i.text)}" aria-pressed="${i.done}">[<span class="mark">${i.done ? '✓' : '&nbsp;'}</span>]</button>
      <span class="itxt">${esc(i.text)}</span></li>`).join('')}
    </ul>
    <form class="additem" data-form="additem" data-id="${l.id}"><input class="field" name="t" maxlength="80" placeholder="+ add item" aria-label="Add item to ${esc(l.title)}"></form>
  </div>`;
}

const SECTIONS = [
  ['schedule', 'SCHEDULE'], ['daily', 'DAILY'], ['weekly', 'WEEKLY'], ['monthly', 'MONTHLY'], ['once', 'ONE-TIME'], ['list', 'LISTS'],
];

export function dayNav(k) {
  const real = M.todayKey();
  return `<div class="daynav">
    <button class="btn vt" data-action="dateprev" aria-label="Previous day">◀</button>
    <button class="dlabel" data-action="datepick" aria-label="Pick a date. Showing ${M.prettyDate(k)}">
      <span class="vt glow">${M.prettyDate(k)}</span><small>${M.relativeDay(k, real)}${k !== real ? '' : ' · tap to pick a date'}</small></button>
    <button class="btn vt" data-action="datenext" aria-label="Next day">▶</button>
  </div>
  ${k !== real ? `<button class="btn vt backtoday" data-action="gotoday">◀ BACK TO TODAY</button>` : ''}`;
}

export function render({ just } = {}) {
  const k = S.ui.date;
  const real = M.todayKey();
  const { filterEl, lowOnly } = S.ui;
  let atoms = live(S.atoms);
  if (filterEl) atoms = atoms.filter(a => a.elementId === filterEl);
  if (lowOnly) atoms = atoms.filter(a => a.energy === 'low');
  const shown = atoms.filter(a => M.showsOn(a, logsFor(a.id), k, real));

  const counted = shown.filter(a => M.countsToday(a, logsFor(a.id), k));
  const doneN = counted.filter(a => M.statusFor(a, logsFor(a.id), k) === 'done').length;
  const pct = counted.length ? Math.round((doneN / counted.length) * 100) : 0;

  const chips = [`<button class="chip ${!filterEl ? 'on' : ''}" data-action="filter" data-el="">All</button>`]
    .concat(live(S.elements).map(e => `<button class="chip ${filterEl === e.id ? 'on' : ''}" data-action="filter" data-el="${e.id}">${esc(e.name)}</button>`))
    .concat(`<button class="chip ${lowOnly ? 'on' : ''}" data-action="lowonly">Low energy</button>`);

  const bySection = new Map(SECTIONS.map(([key]) => [key, []]));
  for (const a of shown) bySection.get(M.frequency(a)).push(a);
  bySection.get('schedule').sort((x, y) => x.start.localeCompare(y.start));
  bySection.get('once').sort((x, y) => (x.dueDate || '9').localeCompare(y.dueDate || '9'));

  const body = SECTIONS.filter(([key]) => bySection.get(key).length).map(([key, label]) => {
    const list = bySection.get(key);
    const n = key === 'schedule' ? list.length : `${list.filter(a => ['done', 'met'].includes(M.statusFor(a, logsFor(a.id), k))).length} of ${list.length}`;
    const rows = list.map(a => key === 'schedule' ? blockRow(a, k) : key === 'list' ? listCard(a, k, just) : atomRow(a, k, { just })).join('');
    return `<div class="section vt"><span>// ${label}</span><span>${n}</span></div>${rows}`;
  }).join('');

  const nothingAtAll = !live(S.atoms).length;
  return `${dayNav(k)}
    <div class="progress" aria-label="${doneN} of ${counted.length} done">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span class="vt glow">${counted.length ? `${doneN} of ${counted.length} done` : 'nothing due'}</span>
    </div>
    <div class="chips" role="toolbar" aria-label="Filter by category">${chips.join('')}</div>
    ${nothingAtAll ? `<div class="empty" style="margin-top:20px">
        <p>&gt; nothing here yet. type below, for example:</p>
        <p class="tag">#fitness workout monday wednesday friday</p>
        <p class="tag">read 20 min daily #personal</p>
        <p class="tag">#timeblock work 5pm - 11pm</p>
        <p class="tag">#list groceries: eggs, soap, juice</p>
        <p class="tag">pay rent monthly 1st #money</p>
        <p>&gt; tap <span class="vt">?</span> next to the input for everything it understands.</p>
      </div>` : (body || `<p class="empty" style="margin-top:20px">&gt; nothing for ${k === real ? 'today' : 'this day'}${filterEl || lowOnly ? ' with this filter' : ''}.</p>`)}
  `;
}
