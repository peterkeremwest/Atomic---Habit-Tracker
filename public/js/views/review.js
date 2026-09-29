// WEEKLY REVIEW — what got done, what slipped, where the time went (Monday to Sunday).
import { S, live, logsFor, elementById } from '../state.js';
import * as M from '../model.js';
import { esc } from '../ui.js';

const hours = m => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`; };

export function render() {
  const real = M.todayKey();
  const ws = S.ui.reviewWeek || M.weekStart(real);
  const we = M.addDays(ws, 6);
  const r = M.weekReview(live(S.atoms), logsFor, ws, real);
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  const isThis = ws === M.weekStart(real);

  const bars = r.days.map(d => {
    const p = d.due ? Math.round((d.done / d.due) * 100) : 0;
    return `<button class="dcol" data-action="jump" data-date="${d.k}" aria-label="${M.prettyDate(d.k)}: ${d.future ? 'coming up' : `${d.done} of ${d.due} done`}">
      <span class="dbar ${d.future ? 'future' : ''}"><i style="height:${d.future ? 0 : p}%"></i></span>
      <span class="dname">${M.DAY_SHORT[M.weekday(d.k)]}</span><span class="dnum">${d.future ? '' : `${d.done}/${d.due}`}</span></button>`;
  }).join('');

  const cats = [...r.byCat.entries()].map(([id, c]) => {
    const el = elementById(id);
    return { name: el && !el.deletedAt ? el.name : 'No category', ...c };
  }).sort((a, b) => b.due - a.due);

  return `<div class="review">
    <div class="calnav">
      <button class="btn vt" data-action="revprev" aria-label="Previous week">◀</button>
      <span class="vt glow" style="text-align:center">WEEK OF ${M.shortDate(ws).toUpperCase()}<small class="dim" style="display:block;font-size:13px;font-family:'Courier Prime',monospace">${M.shortDate(ws)} – ${M.shortDate(we)}${isThis ? ' · this week' : ''}</small></span>
      <button class="btn vt" data-action="revnext" aria-label="Next week">▶</button>
    </div>
    <div class="progress"><div class="bar"><i style="width:${pct}%"></i></div><span class="vt glow">${r.done} of ${r.total} done</span></div>
    <div class="weekbars">${bars}</div>

    <div class="section vt"><span>// BY CATEGORY</span></div>
    ${cats.length ? cats.map(c => `<div class="kv"><span>${esc(c.name)}</span><span>${c.due ? `${c.done} of ${c.due} done` : ''}${c.blockMin ? `${c.due ? ' · ' : ''}${hours(c.blockMin)} scheduled` : ''}</span></div>`).join('') : '<p class="empty">nothing this week yet.</p>'}

    <div class="section vt"><span>// HABITS</span></div>
    ${r.habits.length ? r.habits.map(h => `<div class="kv"><span>${esc(h.a.title)}</span><span>${h.planned === null ? `${h.done} this week` : `${h.done} of ${h.planned}`}${h.planned && h.done >= h.planned ? ' ✓' : ''}</span></div>`).join('') : '<p class="empty">no habits yet.</p>'}

    <div class="section vt"><span>// FINISHED</span><span>${r.finished.length}</span></div>
    ${r.finished.length ? r.finished.map(a => `<div class="kv"><span>${esc(a.title)}</span><span>${M.shortDate(a.completedOn)}</span></div>`).join('') : '<p class="empty">no one-time tasks or lists finished.</p>'}

    <div class="section vt"><span>// SLIPPED</span><span>${r.slipped.length}</span></div>
    ${r.slipped.length ? r.slipped.map(a => `<div class="kv"><span class="overdue">${esc(a.title)}</span><span>was due ${M.shortDate(a.dueDate)}</span></div>`).join('')
      + `<p class="dim" style="font-size:13px">unfinished tasks keep showing on today as overdue until you finish or move them.</p>`
      : '<p class="empty">nothing slipped. nice.</p>'}
    <div class="actions" style="justify-content:center"><button class="btn vt" data-action="revthis">THIS WEEK</button><a class="btn vt" href="#/calendar">CALENDAR</a></div>
  </div>`;
}
