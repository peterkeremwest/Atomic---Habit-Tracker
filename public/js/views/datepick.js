// Atomic's own date picker. Replaces the phone's built-in date box, which didn't respond to taps
// inside the editor sheet on some phones. Two uses:
//   dateField(name, value)  -> a tappable field in a form; a month grid unfolds under it (value kept in a hidden input)
//   openDateSheet(...)      -> a sheet with just the month grid; tapping a day picks it (used by "Move to another day")
import * as M from '../model.js';
import { esc, openSheet, closeSheet } from '../ui.js';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const label = (v, none) => v ? `${M.prettyDate(v)} · ${M.relativeDay(v)}` : none;

// the month grid + quick buttons
function grid(ym, value, { allowNone = false } = {}) {
  const real = M.todayKey();
  const first = `${ym}-01`;
  const lead = (M.weekday(first) + 6) % 7;
  const n = M.daysInMonth(first);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let d = 1; d <= n; d++) {
    const k = `${ym}-${String(d).padStart(2, '0')}`;
    const cls = [k === real ? 'today' : '', k === value ? 'sel' : '', k < real ? 'past' : ''].join(' ');
    cells += `<button type="button" class="${cls}" data-p="day" data-d="${k}" aria-label="${M.prettyDate(k)}"${k === value ? ' aria-pressed="true"' : ''}>${d}</button>`;
  }
  const [y, m] = ym.split('-').map(Number);
  return `<div class="mcal" data-ym="${ym}">
    <div class="mnav"><button type="button" class="btn vt" data-p="prev" aria-label="Previous month">◀</button>
      <span class="vt glow">${M.MONTHS[m - 1].toUpperCase()} ${y}</span>
      <button type="button" class="btn vt" data-p="next" aria-label="Next month">▶</button></div>
    <div class="mgrid head">${WEEK.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="mgrid days">${cells}</div>
    <div class="mquick">
      <button type="button" class="btn vt" data-p="day" data-d="${real}">TODAY</button>
      <button type="button" class="btn vt" data-p="day" data-d="${M.addDays(real, 1)}">TOMORROW</button>
      <button type="button" class="btn vt" data-p="day" data-d="${M.addDays(real, 7)}">IN A WEEK</button>
      ${allowNone ? `<button type="button" class="btn vt" data-p="none">NO DATE</button>` : ''}
    </div>
  </div>`;
}

export function dateField(name, value, { allowNone = true, none = 'no date — tap to pick' } = {}) {
  return `<div class="dpick" data-name="${name}" data-none="${esc(none)}" data-allow-none="${allowNone ? 1 : ''}">
    <input type="hidden" name="${name}" value="${esc(value || '')}">
    <button type="button" class="field dbtn" data-p="toggle" aria-expanded="false"><span class="dval">${esc(label(value, none))}</span><span class="dim vt">▾</span></button>
    <div class="dcal hidden"></div>
  </div>`;
}

// one listener per form handles every date field inside it
export function wireDateFields(root, onChange = () => {}) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const box = b.closest('.dpick'); if (!box) return;
    e.preventDefault();
    const input = box.querySelector('input[type=hidden]');
    const cal = box.querySelector('.dcal');
    const toggleBtn = box.querySelector('.dbtn');
    const allowNone = !!box.dataset.allowNone;
    const set = v => {
      input.value = v || '';
      box.querySelector('.dval').textContent = label(v, box.dataset.none);
      cal.classList.add('hidden'); toggleBtn.setAttribute('aria-expanded', 'false');
      onChange(box.dataset.name, input.value);
    };
    const p = b.dataset.p;
    if (p === 'toggle') {
      const open = cal.classList.contains('hidden');
      if (open) cal.innerHTML = grid((input.value || M.todayKey()).slice(0, 7), input.value, { allowNone });
      cal.classList.toggle('hidden', !open); toggleBtn.setAttribute('aria-expanded', String(open));
    } else if (p === 'prev' || p === 'next') {
      const ym = shiftMonth(cal.querySelector('.mcal').dataset.ym, p === 'prev' ? -1 : 1);
      cal.innerHTML = grid(ym, input.value, { allowNone });
    } else if (p === 'day') set(b.dataset.d);
    else if (p === 'none') set('');
  });
}

// a sheet that only asks for a day: onPick(dateKey)
export function openDateSheet(title, value, onPick, { note = '' } = {}) {
  let ym = (value || M.todayKey()).slice(0, 7);
  const paint = root => { root.innerHTML = `<h2>${esc(title)}</h2>${note ? `<p class="dim" style="margin:-6px 0 10px;font-size:13px">${esc(note)}</p>` : ''}${grid(ym, value)}
    <div class="actions"><button type="button" class="btn vt" data-p="cancel">CANCEL</button></div>`; };
  openSheet('', root => {
    paint(root);
    root.onclick = e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const p = b.dataset.p;
      if (p === 'prev' || p === 'next') { ym = shiftMonth(ym, p === 'prev' ? -1 : 1); paint(root); }
      else if (p === 'cancel') closeSheet();
      else if (p === 'day') { closeSheet(); onPick(b.dataset.d); }
    };
  });
}
