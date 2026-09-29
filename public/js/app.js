// Atomic — app bootstrap: routing, rendering, and wiring taps to actions.
import { S, load, onChange } from './state.js';
import * as A from './state.js';
import * as M from './model.js';
import { toast, onLongPress, closeSheet, esc } from './ui.js';
import * as Today from './views/today.js';
import * as Habits from './views/habits.js';
import * as Elements from './views/elements.js';
import * as System from './views/system.js';
import { openEditor, openMenu } from './views/sheets.js';

const ROUTES = { today: Today, habits: Habits, elements: Elements, sys: System };
const main = document.querySelector('main');
const quick = document.querySelector('.quick');
let installPrompt = null;
let justChecked = null;
let renderedDay = M.todayKey();

function applySettings() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.body.classList.toggle('scan', !!S.settings.scanlines);
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}

function render() {
  const route = S.ui.route;
  applySettings();
  document.querySelector('.date').textContent = M.prettyDate(M.todayKey());
  const scroll = window.scrollY;
  main.innerHTML = ROUTES[route].render({ just: justChecked, canInstall: !!installPrompt });
  justChecked = null;
  window.scrollTo(0, scroll);
  quick.classList.toggle('hidden', route !== 'today');
  document.querySelectorAll('nav.tabs a').forEach(a => {
    const on = a.dataset.route === route;
    a.classList.toggle('on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}

function go() {
  const r = location.hash.replace(/^#\/?/, '') || 'today';
  S.ui.route = ROUTES[r] ? r : 'today';
  window.scrollTo(0, 0);
  render();
}

// ---------- taps ----------
const actions = {
  async toggle(d) { justChecked = d.id; await A.toggle(d.id); },
  edit: d => openEditor(d.id),
  menu: d => openMenu(d.id),
  filter(d) { S.ui.filterEl = d.el || null; render(); },
  lowonly() { S.ui.lowOnly = !S.ui.lowOnly; render(); },
  showdone() { S.ui.showDone = !S.ui.showDone; render(); },
  async day(d) {
    const cur = A.logsFor(d.id).get(d.date)?.status;
    const next = cur === 'done' ? 'skipped' : cur === 'skipped' ? null : 'done';
    await A.setStatus(d.id, d.date, next);
  },
  openel(d) { S.ui.openEl = S.ui.openEl === d.id ? null : d.id; render(); },
  async deliso(d) { await A.deleteIsotope(d.id); toast('isotope removed'); },
  async editel(d) {
    const e = A.elementById(d.id);
    const name = prompt('Element name', e.name); if (name === null) return;
    const symbol = prompt('Symbol (1–2 letters)', e.symbol); if (symbol === null) return;
    const sym = symbol.trim().charAt(0).toUpperCase() + symbol.trim().slice(1, 2).toLowerCase();
    const err = A.validSymbol(sym, e.id); if (err) return toast(err);
    if (!name.trim()) return;
    await A.updateElement(e.id, { name: name.trim(), symbol: sym });
  },
  async delel(d) {
    const e = A.elementById(d.id);
    const n = A.atomsInElement(d.id).length;
    if (n) return toast(`move or delete its ${n} atom${n === 1 ? '' : 's'} first`);
    if (!confirm(`Delete element ${e.symbol} (${e.name})?`)) return;
    await A.deleteElement(d.id); S.ui.openEl = null; toast('element deleted');
  },
  async export() {
    const data = await A.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `atomic-backup-${M.todayKey()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import() { document.getElementById('importFile')?.click(); },
  async install() { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); },
  async reset() {
    if (!confirm('Erase ALL Atomic data on this device? Export a backup first if unsure.')) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    await A.resetAll(); toast('all data erased');
  },
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t || t.closest('dialog')) return;
  if (t.matches('input')) return; // handled on change
  const fn = actions[t.dataset.action];
  if (fn) { e.preventDefault(); fn(t.dataset); }
});

main.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.action === 'theme') await A.setSettings({ theme: t.value });
  if (t.dataset.action === 'scanlines') await A.setSettings({ scanlines: t.checked });
  if (t.id === 'importFile' && t.files[0]) {
    try {
      const n = await A.importData(JSON.parse(await t.files[0].text()));
      toast(`imported ${n} record${n === 1 ? '' : 's'}`);
    } catch (err) { toast(err.message || 'import failed'); }
  }
});

main.addEventListener('submit', async e => {
  const f = e.target;
  e.preventDefault();
  if (f.dataset.form === 'addiso') {
    const name = f.name.value.trim(); if (!name) return;
    await A.addIsotope(f.dataset.id, name); toast('isotope added');
  }
  if (f.dataset.form === 'addel') {
    const raw = f.symbol.value.trim();
    const sym = raw.charAt(0).toUpperCase() + raw.slice(1, 2).toLowerCase();
    const err = A.validSymbol(sym); if (err) return toast(err);
    if (!f.name.value.trim()) return;
    await A.addElement(sym, f.name.value); toast(`element ${sym} added`);
  }
});

onLongPress(main, '.row', row => openMenu(row.dataset.atom));

// quick add
quick.querySelector('form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = e.target.q;
  const text = input.value.trim();
  if (!text) return openEditor();
  const p = M.parseQuickAdd(text, S.elements, S.isotopes);
  if (!p.title) return toast('add a title too');
  if (!p.elementId && S.ui.filterEl) p.elementId = S.ui.filterEl;
  await A.addAtom(p);
  input.value = '';
  toast(p.kind === 'habit' ? `habit added · ${M.describeRepeat(p)}` : 'task added');
});
quick.querySelector('[data-x="full"]').addEventListener('click', () => {
  const input = quick.querySelector('input');
  const p = input.value.trim() ? M.parseQuickAdd(input.value, S.elements, S.isotopes) : {};
  input.value = '';
  openEditor(null, p);
});

// sheet: close on backdrop tap
document.getElementById('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// install prompt (Chrome/Android)
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (S.ui.route === 'sys') render(); });
window.addEventListener('online', render);
window.addEventListener('offline', render);
// roll over to a new day if the app stays open past midnight
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && M.todayKey() !== renderedDay) { renderedDay = M.todayKey(); render(); }
});

window.addEventListener('hashchange', go);
onChange(render);

(async () => {
  try {
    await load();
  } catch (err) {
    main.innerHTML = `<p class="overdue">&gt; storage unavailable: ${esc(err.message || err)}</p><p class="dim">private browsing can block on-device storage.</p>`;
    return;
  }
  go();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
