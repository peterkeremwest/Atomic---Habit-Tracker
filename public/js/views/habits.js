// HABITS — streaks, this week's days (tap a day to fix history) and a 12-week history grid.
import { S, live, logsFor, elementById, isotopeById } from '../state.js';
import * as M from '../model.js';
import { esc } from '../ui.js';

const CELL = { done: '✓', partial: '~', skipped: '–' };
const FREQ = [['daily', 'DAILY'], ['weekly', 'WEEKLY'], ['monthly', 'MONTHLY']];

function card(a, k) {
  const logs = logsFor(a.id);
  const st = M.streak(a, logs, k);
  const iso = isotopeById(a.isotopeId), el = elementById(a.elementId);
  const ws = M.weekStart(k);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = M.addDays(ws, i);
    const s = logs.get(d)?.status;
    const future = d > k;
    const off = !M.isScheduled(a, d);
    const cls = [s || '', off ? 'off' : '', d === k ? 'today' : ''].join(' ');
    return `<button class="vt ${cls}" data-action="day" data-id="${a.id}" data-date="${d}" ${future ? 'disabled' : ''}
      aria-label="${M.prettyDate(d)}: ${s || 'not done'}"><span class="d">${M.DAY_SHORT[M.weekday(d)]}</span>${CELL[s] || (future ? '&nbsp;' : '·')}</button>`;
  }).join('');
  const start = M.addDays(ws, -7 * 11);
  let heat = '';
  for (let i = 0; i < 84; i++) {
    const d = M.addDays(start, i);
    const s = logs.get(d)?.status;
    const lvl = s === 'done' ? 'l2' : (s === 'partial' || s === 'skipped') ? 'l1' : '';
    heat += `<i class="${lvl} ${d > k ? 'off' : ''}" title="${M.shortDate(d)}"></i>`;
  }
  const sub = [el && !el.deletedAt ? M.tagOf(el.name) : '', iso && !iso.deletedAt ? iso.name : '', M.describeRepeat(a),
    a.target?.kind === 'count' ? `goal ${a.target.goal} a day` : ''].filter(Boolean).map(esc).join(' · ');
  return `<div class="hcard">
    <div class="head">
      <div><button class="title" data-action="edit" data-id="${a.id}">${esc(a.title)}</button>
        <div class="dim" style="font-size:13px">${sub}</div></div>
      <div class="streak vt glow" aria-label="${st.value}-${st.unit} streak">${st.value}<small> ${st.unit}${st.value === 1 ? '' : 's'}</small></div>
    </div>
    <div class="week">${week}</div>
    <div class="heatwrap"><span class="dim">last 12 weeks</span><div class="heat" aria-hidden="true">${heat}</div></div>
  </div>`;
}

export function render() {
  const k = M.todayKey();
  const habits = live(S.atoms).filter(a => a.kind === 'habit');
  if (!habits.length) return `<p class="empty" style="margin-top:24px">&gt; no habits yet. on TODAY, add something with a repeat word, e.g. <span class="tag">daily</span>, <span class="tag">monday wednesday friday</span>, <span class="tag">3x a week</span> or <span class="tag">monthly</span>.</p>`;
  return FREQ.map(([key, label]) => {
    const list = habits.filter(h => M.frequency(h) === key);
    if (!list.length) return '';
    return `<div class="section vt"><span>// ${label}</span><span>${list.length}</span></div>${list.map(h => card(h, k)).join('')}`;
  }).join('') + `<p class="dim" style="font-size:13px;margin-top:14px">tap a day to change it: done → skipped → clear. skipping never breaks a streak.</p>`;
}
