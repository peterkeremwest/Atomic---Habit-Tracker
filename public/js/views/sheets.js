// Bottom sheets: the atom editor and the long-press menu.
import { S, live, isotopesOf } from '../state.js';
import * as A from '../state.js';
import * as M from '../model.js';
import { esc, openSheet, closeSheet, toast } from '../ui.js';

const radio = (name, value, label, checked) =>
  `<label><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;

export function openEditor(atomId = null, preset = {}) {
  const a = atomId ? S.atoms.find(x => x.id === atomId) : null;
  const v = a || { kind: 'task', title: '', elementId: S.ui.filterEl, isotopeId: null, repeat: { type: 'daily' }, target: { kind: 'check' }, dueDate: null, energy: null, note: '', ...preset };
  const r = v.repeat || { type: 'daily' };
  const days = r.type === 'days' ? r.days : [1, 2, 3, 4, 5];
  const isoOpts = elId => `<option value="">— none —</option>` + (elId ? isotopesOf(elId).map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('') : '');

  openSheet(`<h2>${a ? 'EDIT ATOM' : 'NEW ATOM'}</h2>
  <form class="form" id="atomForm" autocomplete="off">
    <label for="f-title">TITLE</label>
    <input class="field" id="f-title" name="title" maxlength="120" required value="${esc(v.title)}">
    <label>TYPE</label>
    <div class="seg">${radio('kind', 'task', 'TASK', v.kind === 'task')}${radio('kind', 'habit', 'HABIT', v.kind === 'habit')}</div>
    <label for="f-el">ELEMENT</label>
    <select class="field" id="f-el" name="elementId"><option value="">— none —</option>
      ${live(S.elements).map(e => `<option value="${e.id}" ${e.id === v.elementId ? 'selected' : ''}>[${esc(e.symbol)}] ${esc(e.name)}</option>`).join('')}</select>
    <label for="f-iso">ISOTOPE</label>
    <select class="field" id="f-iso" name="isotopeId">${isoOpts(v.elementId)}</select>

    <div data-show="habit">
      <label>REPEAT</label>
      <div class="seg">${radio('rtype', 'daily', 'DAILY', r.type === 'daily')}${radio('rtype', 'days', 'ON DAYS', r.type === 'days')}${radio('rtype', 'perWeek', 'X PER WEEK', r.type === 'perWeek')}</div>
      <div class="seg" data-show-r="days" style="margin-top:8px">
        ${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" name="days" value="${d}" ${days.includes(d) ? 'checked' : ''}><span>${M.DAY_NAMES[d].slice(0, 2)}</span></label>`).join('')}
      </div>
      <div data-show-r="perWeek" style="margin-top:8px">
        <select class="field" name="perWeek" aria-label="Times per week" style="max-width:140px">
          ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${r.count === n ? 'selected' : ''}>${n}x / week</option>`).join('')}</select>
      </div>
      <label>COMPLETE BY</label>
      <div class="seg">${radio('tkind', 'check', 'CHECKBOX', v.target?.kind !== 'count')}${radio('tkind', 'count', 'COUNTER', v.target?.kind === 'count')}</div>
      <div data-show-t="count" style="margin-top:8px">
        <input class="field" type="number" name="goal" min="2" max="99" value="${v.target?.goal || 8}" aria-label="Daily goal" style="max-width:140px">
      </div>
    </div>

    <div data-show="task">
      <label for="f-due">DUE DATE (optional)</label>
      <input class="field" type="date" id="f-due" name="dueDate" value="${v.dueDate || ''}">
    </div>

    <label>ENERGY</label>
    <div class="seg">${radio('energy', '', '—', !v.energy)}${radio('energy', 'low', 'LOW', v.energy === 'low')}${radio('energy', 'high', 'HIGH', v.energy === 'high')}</div>
    <label for="f-note">NOTE</label>
    <textarea class="field" id="f-note" name="note" rows="2" maxlength="500">${esc(v.note)}</textarea>

    <div class="actions">
      ${a ? `<button type="button" class="btn vt warn" data-x="delete" style="margin-right:auto">DELETE</button>` : ''}
      <button type="button" class="btn vt" data-x="cancel">CANCEL</button>
      <button type="submit" class="btn solid vt">SAVE</button>
    </div>
  </form>`, root => {
    const f = root.querySelector('#atomForm');
    const sync = () => {
      const kind = f.kind.value, rt = f.rtype.value, tk = f.tkind.value;
      root.querySelectorAll('[data-show]').forEach(n => n.classList.toggle('hidden', n.dataset.show !== kind));
      root.querySelectorAll('[data-show-r]').forEach(n => n.classList.toggle('hidden', n.dataset.showR !== rt));
      root.querySelectorAll('[data-show-t]').forEach(n => n.classList.toggle('hidden', n.dataset.showT !== tk));
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
      if (!confirm(`Delete "${a.title}"? Its history is kept in backups.`)) return;
      await A.deleteAtom(a.id); closeSheet(); toast('atom deleted');
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const kind = f.kind.value;
      let repeat = null, target = { kind: 'check' };
      if (kind === 'habit') {
        const rt = f.rtype.value;
        if (rt === 'days') {
          const ds = [...f.querySelectorAll('input[name=days]:checked')].map(x => +x.value).sort();
          if (!ds.length) { toast('pick at least one day'); return; }
          repeat = ds.length === 7 ? { type: 'daily' } : { type: 'days', days: ds };
        } else if (rt === 'perWeek') repeat = { type: 'perWeek', count: +f.perWeek.value };
        else repeat = { type: 'daily' };
        if (f.tkind.value === 'count') target = { kind: 'count', goal: Math.min(99, Math.max(2, +f.goal.value || 2)) };
      }
      const data = {
        title: f.title.value.trim(), kind,
        elementId: f.elementId.value || null, isotopeId: f.isotopeId.value || null,
        repeat, target, dueDate: kind === 'task' ? (f.dueDate.value || null) : null,
        energy: f.energy.value || null, note: f.note.value.trim(),
      };
      if (!data.title) return;
      if (a) await A.updateAtom(a.id, data); else await A.addAtom(data);
      closeSheet(); toast(a ? 'saved' : 'atom added');
    });
  });
}

export function openMenu(atomId) {
  const a = S.atoms.find(x => x.id === atomId);
  if (!a) return;
  const k = M.todayKey();
  const s = M.statusFor(a, A.logsFor(a.id), k);
  const items = [];
  if (a.kind === 'task') {
    items.push(['toggle', a.completedOn ? 'Mark not done' : 'Mark done']);
    if (!a.completedOn) items.push(['snooze', 'Push to tomorrow']);
  } else if (a.target?.kind === 'count') {
    items.push(['plus', '+1'], ['minus', '−1'], ['skip', 'Skip today (keeps streak)'], ['clear', 'Reset today']);
  } else {
    if (s !== 'done') items.push(['done', 'Mark done']);
    if (s !== 'partial') items.push(['partial', 'Partly done']);
    if (s !== 'skipped') items.push(['skip', 'Skip today (keeps streak)']);
    if (s) items.push(['clear', 'Clear today']);
  }
  items.push(['edit', 'Edit'], ['delete', 'Delete']);
  openSheet(`<h2>${esc(a.title)}</h2><div class="menu">${items.map(([x, l]) =>
    `<button data-x="${x}" class="${x === 'delete' ? 'warn' : ''}">${esc(l)}</button>`).join('')}</div>`, root => {
    root.querySelector('.menu').addEventListener('click', async e => {
      const x = e.target.closest('button')?.dataset.x;
      if (!x) return;
      if (x === 'edit') return openEditor(a.id);
      if (x === 'delete') { if (!confirm(`Delete "${a.title}"?`)) return; await A.deleteAtom(a.id); closeSheet(); return toast('atom deleted'); }
      closeSheet();
      if (x === 'toggle' || x === 'done') await (a.kind === 'task' ? A.toggle(a.id, k) : A.setStatus(a.id, k, 'done'));
      if (x === 'snooze') { await A.snooze(a.id); toast('moved to tomorrow'); }
      if (x === 'partial') await A.setStatus(a.id, k, 'partial');
      if (x === 'skip') { await A.setStatus(a.id, k, 'skipped'); toast('skipped — streak safe'); }
      if (x === 'clear') await A.setStatus(a.id, k, null);
      if (x === 'plus') await A.bump(a.id, k, +1);
      if (x === 'minus') await A.bump(a.id, k, -1);
    });
  });
}
