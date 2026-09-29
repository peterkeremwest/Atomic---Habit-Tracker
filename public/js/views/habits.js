// HABITS — streaks, this week's strip (tap a day to fix history) and a 12-week heatmap.
import { S, live, logsFor, elementById, isotopeById } from '../state.js';
import * as M from '../model.js';
import { esc } from '../ui.js';

const CELL = { done: '■', partial: '▪', skipped: '–' };

function card(a, k) {
  const logs = logsFor(a.id);
  const st = M.streak(a, logs, k);
  const iso = isotopeById(a.isotopeId);
  const ws = M.weekStart(k);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = M.addDays(ws, i);
    const s = logs.get(d)?.status;
    const future = d > k;
    const off = !M.isScheduled(a, d);
    const cls = [s || '', off ? 'off' : '', d === k ? 'today' : ''].join(' ');
    return `<button class="vt ${cls}" data-action="day" data-id="${a.id}" data-date="${d}" ${future ? 'disabled' : ''}
      aria-label="${M.prettyDate(d)}: ${s || 'not done'}"><span class="d">${M.DAY_NAMES[M.weekday(d)].slice(0, 2)}</span>${CELL[s] || (future ? '&nbsp;' : '·')}</button>`;
  }).join('');
  // 12 weeks, columns = weeks, rows = Mon..Sun
  const start = M.addDays(ws, -7 * 11);
  let heat = '';
  for (let i = 0; i < 84; i++) {
    const d = M.addDays(start, i);
    const s = logs.get(d)?.status;
    const lvl = s === 'done' ? 'l2' : (s === 'partial' || s === 'skipped') ? 'l1' : '';
    heat += `<i class="${lvl} ${d > k ? 'off' : ''}" title="${d}"></i>`;
  }
  return `<div class="hcard">
    <div class="head">
      <div><button class="title" data-action="edit" data-id="${a.id}">${esc(a.title)}</button>
        <div class="dim" style="font-size:13px">${iso ? esc(iso.name) + ' · ' : ''}${esc(M.describeRepeat(a))}${a.target?.kind === 'count' ? ` · goal ${a.target.goal}/day` : ''}</div></div>
      <div class="streak vt glow" aria-label="Streak ${st.value}">${st.value}${st.unit} ▲</div>
    </div>
    <div class="week">${week}</div>
    <div class="heat" aria-hidden="true">${heat}</div>
  </div>`;
}

export function render() {
  const k = M.todayKey();
  const habits = live(S.atoms).filter(a => a.kind === 'habit');
  if (!habits.length) return `<p class="empty" style="margin-top:24px">&gt; no habits yet. add one on TODAY with a repeat word, e.g. <span class="tag">daily</span>, <span class="tag">mon wed fri</span> or <span class="tag">3x</span>.</p>`;
  const groups = new Map();
  for (const h of habits) {
    const key = h.elementId || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  const order = [...live(S.elements).map(e => e.id), ''];
  return order.filter(id => groups.has(id)).map(id => {
    const el = elementById(id);
    return `<div class="section vt"><span>// ${el ? `[${esc(el.symbol)}] ${esc(el.name.toUpperCase())}` : 'UNSORTED'}</span></div>
      ${groups.get(id).map(h => card(h, k)).join('')}`;
  }).join('') + `<p class="dim" style="font-size:13px;margin-top:14px">tap a day to cycle: done → skipped → clear. skips never break a streak.</p>`;
}
