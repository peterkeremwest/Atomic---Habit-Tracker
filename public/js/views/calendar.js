// CALENDAR — month grid (same idea as Forge's calendar): tap a day to open it on the day screen.
import { S, live, logsFor } from '../state.js';
import * as M from '../model.js';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ym = 'YYYY-MM'
export function monthGrid(ym) {
  const real = M.todayKey();
  const first = `${ym}-01`;
  const lead = (M.weekday(first) + 6) % 7; // Monday-first
  const n = M.daysInMonth(first);
  const atoms = live(S.atoms);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let d = 1; d <= n; d++) {
    const k = `${ym}-${String(d).padStart(2, '0')}`;
    const sum = M.daySummary(atoms, logsFor, k, real);
    const past = k <= real;
    const all = past && sum.due > 0 && sum.done === sum.due;
    const some = past && sum.done > 0 && !all;
    const cls = [k === real ? 'today' : '', k === S.ui.date ? 'sel' : '', all ? 'all' : '', k > real ? 'future' : ''].join(' ');
    const state = all ? 'everything done' : some ? `${sum.done} of ${sum.due} done` : sum.planned ? 'something planned' : '';
    cells += `<button class="${cls}" data-action="jump" data-date="${k}" aria-label="${M.prettyDate(k)}${state ? ', ' + state : ''}">
      <span class="n vt">${d}</span>
      <span class="dots">${sum.planned ? '<i class="p"></i>' : ''}${some ? '<i class="s"></i>' : ''}${all ? '<i class="a"></i>' : ''}</span>
    </button>`;
  }
  const [y, m] = ym.split('-').map(Number);
  return `<div class="cal">
    <div class="calnav">
      <button class="btn vt" data-action="calprev" aria-label="Previous month">◀</button>
      <span class="vt glow">${M.MONTHS[m - 1].toUpperCase()} ${y}</span>
      <button class="btn vt" data-action="calnext" aria-label="Next month">▶</button>
    </div>
    <div class="calgrid head">${WEEK.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="calgrid days">${cells}</div>
    <div class="legend"><span><i class="p"></i> something planned</span><span><i class="s"></i> partly done</span><span><i class="a"></i> everything done</span></div>
    <div class="actions" style="justify-content:center"><button class="btn vt" data-action="calthis">THIS MONTH</button><button class="btn vt" data-action="gotoday">GO TO TODAY</button></div>
  </div>`;
}

export function render() {
  return monthGrid(S.ui.calMonth) + `<p class="dim" style="font-size:13px;text-align:center">tap a day to see or plan it.</p>
    <button class="btn vt backtoday" data-action="review" style="margin-top:14px">WEEKLY REVIEW ▶</button>`;
}
