// Atomic — app bootstrap: routing, rendering, and wiring taps to actions.
import { S, load, onChange } from './state.js';
import * as A from './state.js';
import * as M from './model.js';
import { toast, onLongPress, closeSheet, esc } from './ui.js';
import * as Today from './views/today.js';
import * as Habits from './views/habits.js';
import * as Elements from './views/elements.js';
import * as System from './views/system.js';
import { openEditor, openMenu, openRenameCategory, openHelp } from './views/sheets.js';

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
  async item(d) { justChecked = d.id; await A.toggleListItem(d.id, d.item); },
  async deliso(d) { await A.deleteIsotope(d.id); toast('subcategory removed'); },
  editel: d => openRenameCategory(d.id),
  async delel(d) {
    const e = A.elementById(d.id);
    const n = A.atomsInElement(d.id).length;
    if (n) return toast(`move or delete its ${n} atom${n === 1 ? '' : 's'} first`);
    if (!confirm(`Delete the ${e.name} category?`)) return;
    await A.deleteElement(d.id); S.ui.openEl = null; if (S.ui.filterEl === d.id) S.ui.filterEl = null; toast('category deleted');
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
    const name = f.t.value.trim(); if (!name) return;
    await A.addIsotope(f.dataset.id, name); toast('subcategory added');
  }
  if (f.dataset.form === 'addel') {
    const err = A.validCategoryName(f.t.value); if (err) return toast(err);
    const e = await A.addCategory(f.t.value); toast(`${M.tagOf(e.name)} added`);
  }
  if (f.dataset.form === 'additem') {
    const text = f.t.value.trim(); if (!text) return;
    await A.addListItems(f.dataset.id, text.split(',')); 
    setTimeout(() => main.querySelector(`form[data-form=additem][data-id="${f.dataset.id}"] input`)?.focus(), 0);
  }
});

onLongPress(main, '.row', row => openMenu(row.dataset.atom));

// quick add
quick.querySelector('form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = e.target.q;
  const text = input.value.trim();
  if (!text) return openEditor();
  const parsed = M.parseQuickAdd(text, S.elements, S.isotopes);
  for (const p of parsed) if (!p.elementId && !p.newCategory && S.ui.filterEl) p.elementId = S.ui.filterEl;
  if (parsed.every(p => !p.title)) return toast('add a title too');
  const newCats = [...new Set(parsed.map(p => p.newCategory).filter(Boolean))];
  const made = await A.addParsed(parsed);
  input.value = '';
  const first = made[0] || {};
  const what = first.appended ? `added ${first.appended} item${first.appended === 1 ? '' : 's'} to ${first.title}`
    : made.length > 1 ? `${made.length} time blocks added`
    : first.kind === 'habit' ? `habit added · ${M.describeRepeat(first)}`
    : first.kind === 'block' ? `time block added · ${M.fmtTime(first.start)}–${M.fmtTime(first.end)}`
    : first.kind === 'list' ? `list added · ${first.items.length} items` : 'task added';
  toast(newCats.length ? `${what} · new category ${newCats.map(M.tagOf).join(' ')}` : what);
});
quick.querySelector('[data-x="help"]').addEventListener('click', openHelp);
quick.querySelector('[data-x="full"]').addEventListener('click', () => {
  const input = quick.querySelector('input');
  const p = input.value.trim() ? M.parseQuickAdd(input.value, S.elements, S.isotopes)[0] : {};
  if (p.newCategory) { const c = M.findCategory(p.newCategory, S.elements); if (c) p.elementId = c.id; }
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
