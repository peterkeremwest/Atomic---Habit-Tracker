// Atomic — app bootstrap: routing, rendering, and wiring taps to actions.
import { S, load, onChange } from './state.js';
import * as A from './state.js';
import * as M from './model.js';
import { toast, onLongPress, closeSheet, openSheet, esc, setUndoHandler } from './ui.js';
import * as Today from './views/today.js';
import * as Habits from './views/habits.js';
import * as Calendar from './views/calendar.js';
import * as Review from './views/review.js';
import * as Elements from './views/elements.js';
import * as System from './views/system.js';
import * as Notes from './views/notes.js';
import { openEditor, openMenu, openRenameCategory, openHelp, openSearch } from './views/sheets.js';
import { openAccount, askSignOut } from './views/account.js';
import * as Sync from './sync.js';
import * as Auth from './auth.js';

const ROUTES = { today: Today, notes: Notes, calendar: Calendar, review: Review, habits: Habits, elements: Elements, sys: System };
const main = document.querySelector('main');
const quick = document.querySelector('.quick');
const daybar = document.getElementById('daybar');
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
  const scroll = window.scrollY;
  daybar.innerHTML = route === 'today' ? Today.renderTop() : '';
  main.innerHTML = ROUTES[route].render({ just: justChecked, canInstall: !!installPrompt });
  justChecked = null;
  window.scrollTo(0, scroll);
  quick.classList.toggle('hidden', route !== 'today');
  const input = quick.querySelector('input');
  input.placeholder = S.ui.date === M.todayKey() ? 'add a task, habit or list…' : `add to ${M.prettyDate(S.ui.date)}…`;
  document.querySelectorAll('nav.tabs a').forEach(a => {
    const on = a.dataset.route === (route === 'review' ? 'calendar' : route);
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

// ---------- dates (same idea as Forge: one "current date" the day screen shows) ----------
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function setDate(k) {
  S.ui.date = k;
  S.ui.calMonth = k.slice(0, 7);
  window.scrollTo(0, 0);
  render();
}
function openDatePicker() {
  S.ui.calMonth = S.ui.date.slice(0, 7);
  const paint = root => { root.innerHTML = `<h2>PICK A DAY</h2>${Calendar.monthGrid(S.ui.calMonth)}`; };
  openSheet('', root => {
    paint(root);
    root.onclick = e => {
      const b = e.target.closest('[data-action]'); if (!b) return;
      const a = b.dataset.action;
      if (a === 'jump') { closeSheet(); setDate(b.dataset.date); }
      else if (a === 'gotoday') { closeSheet(); setDate(M.todayKey()); }
      else if (a === 'calprev') { S.ui.calMonth = shiftMonth(S.ui.calMonth, -1); paint(root); }
      else if (a === 'calnext') { S.ui.calMonth = shiftMonth(S.ui.calMonth, 1); paint(root); }
      else if (a === 'calthis') { S.ui.calMonth = M.todayKey().slice(0, 7); paint(root); }
    };
  });
}

// ---------- header: typed title + blinking cursor, which turns into a warning sign offline ----------
function paintStatus() {
  const c = document.querySelector('.cursor');
  const off = !navigator.onLine;
  c.classList.toggle('offline', off);
  c.textContent = off ? '⚠' : '';
  c.title = off ? 'offline — changes are saved on this device' : 'online';
  c.setAttribute('aria-label', off ? 'Offline' : 'Online');
}
function typeTitle() {
  const t = document.querySelector('.typed');
  const word = 'ATOMIC';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { t.textContent = word; return; }
  t.textContent = '';
  let i = 0;
  const step = () => { t.textContent = word.slice(0, ++i); if (i < word.length) setTimeout(step, 110 + Math.random() * 90); };
  setTimeout(step, 250);
}

// ---------- taps ----------
const actions = {
  async toggle(d) {
    const a = S.atoms.find(x => x.id === d.id); if (!a) return;
    const k = S.ui.date;
    if (a.kind === 'habit' && a.target?.kind === 'timer' && k === M.todayKey() && M.statusFor(a, A.logsFor(a.id), k) !== 'done') {
      await A.timerToggle(a.id, k);
      return toast(A.timerRunning(a.id) ? `timer started · ${a.target.minutes} min` : 'timer paused');
    }
    justChecked = d.id;
    const before = M.statusFor(a, A.logsFor(a.id), k);
    await A.undoable('check', () => A.toggle(d.id, k));
    const after = M.statusFor(S.atoms.find(x => x.id === d.id), A.logsFor(d.id), k);
    if (a.kind === 'expense') return toast(`${after === 'done' ? 'marked paid' : 'marked not paid'} · ${a.title}`, { undo: true });
    toast(after === 'done' && before !== 'done' ? `checked · ${a.title}` : a.target?.kind === 'count' ? `${A.logsFor(d.id).get(k)?.count || 0} of ${a.target.goal}` : `unchecked · ${a.title}`, { undo: true });
  },
  async moveleft() {
    const n = await A.undoable('move', () => A.moveLeftovers(S.ui.date));
    toast(`moved ${n} to tomorrow`, { undo: true });
  },
  search: () => openSearch((a, date) => { if (date) { setDate(date); location.hash = '#/today'; } else openEditor(a.id); }),
  review() { S.ui.reviewWeek = M.weekStart(M.todayKey()); location.hash = '#/review'; },
  revprev() { S.ui.reviewWeek = M.addDays(S.ui.reviewWeek || M.weekStart(M.todayKey()), -7); render(); },
  revnext() { S.ui.reviewWeek = M.addDays(S.ui.reviewWeek || M.weekStart(M.todayKey()), 7); render(); },
  revthis() { S.ui.reviewWeek = M.weekStart(M.todayKey()); render(); },
  dateprev() { setDate(M.addDays(S.ui.date, -1)); },
  datenext() { setDate(M.addDays(S.ui.date, 1)); },
  gotoday() { setDate(M.todayKey()); if (S.ui.route !== 'today') location.hash = '#/today'; },
  datepick: () => openDatePicker(),
  jump(d) { setDate(d.date); location.hash = '#/today'; },
  calprev() { S.ui.calMonth = shiftMonth(S.ui.calMonth, -1); render(); },
  calnext() { S.ui.calMonth = shiftMonth(S.ui.calMonth, 1); render(); },
  calthis() { S.ui.calMonth = M.todayKey().slice(0, 7); render(); },
  edit: d => openEditor(d.id),
  menu: d => openMenu(d.id),
  filter(d) { S.ui.filterEl = d.el || null; render(); },
  async fold(d) {
    const sec = main.querySelector(`section.sec[data-sec="${d.sec}"]`);
    const on = !S.ui.folded.has(d.sec);
    sec?.classList.toggle('folded', on);
    sec?.querySelector('.section')?.setAttribute('aria-expanded', String(!on));
    await A.setFolded(d.sec, on);
  },
  async ongoingdone() { await A.setSettings({ ongoingShowDone: !S.settings.ongoingShowDone }); },
  async notepin(d) {
    const n = S.atoms.find(x => x.id === d.id); if (!n) return;
    await A.undoable('pin', () => A.updateAtom(n.id, { pinned: !n.pinned }));
    toast(n.pinned ? 'removed from Today' : 'shows on Today every day', { undo: true });
  },
  newnote: () => openEditor(null, { kind: 'note' }),
  lowonly() { S.ui.lowOnly = !S.ui.lowOnly; render(); },
  async day(d) {
    const cur = A.logsFor(d.id).get(d.date)?.status;
    const next = cur === 'done' ? 'skipped' : cur === 'skipped' ? null : 'done';
    await A.setStatus(d.id, d.date, next);
  },
  openel(d) { S.ui.openEl = S.ui.openEl === d.id ? null : d.id; render(); },
  async item(d) {
    justChecked = d.id;
    await A.undoable('item', () => A.toggleListItem(d.id, d.item));
    const a = S.atoms.find(x => x.id === d.id);
    toast(a.completedOn ? `all done · ${a.title} ✓` : 'updated', { undo: true });
  },
  async deliso(d) { await A.deleteIsotope(d.id); toast('subcategory removed'); },
  editel: d => openRenameCategory(d.id),
  async delel(d) {
    const e = A.elementById(d.id);
    const n = A.atomsInElement(d.id).length;
    if (!confirm(`Delete the ${e.name} category?${n ? `\n\nIts ${n} item${n === 1 ? '' : 's'} will stay, just without a category.` : ''}`)) return;
    await A.undoable('delcat', () => A.deleteElement(d.id)); S.ui.openEl = null; if (S.ui.filterEl === d.id) S.ui.filterEl = null; toast('category deleted', { undo: true });
  },
  async export() {
    const data = await A.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `atomic-backup-${M.todayKey()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import() { document.getElementById('importFile')?.click(); },
  signin: () => openAccount('signin'),
  signup: () => openAccount('signup'),
  signout: () => askSignOut(),
  async syncnow() { await Sync.syncNow(); toast(S.sync.state === 'idle' ? 'synced' : S.sync.state === 'offline' ? 'offline · will sync when you are back online' : S.sync.state === 'error' ? "couldn't sync, will try again" : 'sync is not on'); },
  async install() { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); },
  async reset() {
    const cloud = Auth.signedIn();
    if (!confirm(`Erase ALL Atomic data on this device?${cloud ? ' Your cloud copy stays, and you will be signed out.' : ' Export a backup first if unsure.'}`)) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    if (cloud) await Sync.signOutAndClear(true); else await A.resetAll();
    toast('all data erased on this device');
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
  if (f.dataset.form === 'addnote') {
    const text = f.t.value.trim(); if (!text) return;
    const made = await A.undoable('note', () => A.addParsed(M.parseQuickAdd('#note ' + text, S.elements, S.isotopes)));
    const n = made[0];
    toast(n?.appended ? `added ${n.appended} to ${n.title}` : 'note added', { undo: true });
    setTimeout(() => main.querySelector('form[data-form=addnote] input')?.focus(), 0);
  }
  if (f.dataset.form === 'addcost') {
    const costs = M.parseCosts(f.t.value.trim()); if (!costs.length) return;
    await A.undoable('addcost', () => A.addCosts(f.dataset.id, costs));
    const a = S.atoms.find(x => x.id === f.dataset.id);
    toast(`${costs.length === 1 ? 'cost' : costs.length + ' costs'} added · total ${M.fmtMoney(M.expenseTotal(a))}`, { undo: true });
    setTimeout(() => main.querySelector(`form[data-form=addcost][data-id="${f.dataset.id}"] input`)?.focus(), 0);
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
  const parsed = M.parseQuickAdd(text, S.elements, S.isotopes, M.todayKey(), S.ui.date);
  for (const p of parsed) if (!p.elementId && !p.newCategory && S.ui.filterEl) p.elementId = S.ui.filterEl;
  if (parsed.every(p => !p.title)) return toast('add a title too');
  const newCats = [...new Set(parsed.map(p => p.newCategory).filter(Boolean))];
  const made = await A.undoable('add', () => A.addParsed(parsed));
  input.value = '';
  const first = made[0] || {};
  const what = first.kind === 'expense' ? (first.appended ? `added ${first.appended} cost${first.appended === 1 ? '' : 's'} to ${first.title}` : `expense list added`) + ` · total ${M.fmtMoney(M.expenseTotal(first))}`
    : first.appended ? `added ${first.appended} item${first.appended === 1 ? '' : 's'} to ${first.title}`
    : made.length > 1 ? `${made.length} time blocks added`
    : first.kind === 'habit' ? `habit added · ${M.describeRepeat(first)}`
    : first.kind === 'block' ? `time block added · ${M.fmtTime(first.start)}–${M.fmtTime(first.end)}`
    : first.kind === 'list' ? `list added · ${first.items.length} items`
    : first.kind === 'note' ? 'note added · find it in NOTES'
    : first.ongoing ? 'ongoing task added · stays until done'
    : first.dueDate ? `task added · ${M.prettyDate(first.dueDate)}` : 'task added';
  // warn if a new time block overlaps anything already scheduled that day
  let warn = '';
  for (const b of made.filter(x => x && x.kind === 'block')) {
    const day = b.date || S.ui.date;
    const same = A.live(S.atoms).filter(x => x.kind === 'block' && M.isScheduled(x, day));
    const hit = M.clashes(same).get(b.id);
    if (hit) { warn = ` · ⚠ overlaps ${hit.join(', ')}`; break; }
  }
  toast((newCats.length ? `${what} · new category ${newCats.map(M.tagOf).join(' ')}` : what) + warn, { undo: true });
});
quick.querySelector('[data-x="help"]').addEventListener('click', openHelp);
quick.querySelector('[data-x="full"]').addEventListener('click', () => {
  const input = quick.querySelector('input');
  const p = input.value.trim() ? M.parseQuickAdd(input.value, S.elements, S.isotopes, M.todayKey(), S.ui.date)[0]
    : (S.ui.date !== M.todayKey() ? { dueDate: S.ui.date, date: S.ui.date } : {});
  if (p.newCategory) { const c = M.findCategory(p.newCategory, S.elements); if (c) p.elementId = c.id; }
  input.value = '';
  openEditor(null, p);
});

setUndoHandler(async () => { if (await A.undo()) toast('undone'); });

// ---------- drag to reorder (the ⠿ handle; stays inside its own section) ----------
main.addEventListener('pointerdown', e => {
  const h = e.target.closest('.drag'); if (!h) return;
  const row = h.closest('.listcard') || h.closest('.row');
  const box = row.parentElement;
  if (!box.classList.contains('secinner')) return;
  e.preventDefault();
  let lastY = e.clientY, offset = 0;
  row.classList.add('dragging');
  const move = ev => {
    offset += ev.clientY - lastY; lastY = ev.clientY;
    row.style.transform = `translateY(${offset}px)`;
    const prev = row.previousElementSibling, next = row.nextElementSibling;
    if (prev && prev.dataset.atom && offset < -prev.offsetHeight / 2) { offset += prev.offsetHeight; box.insertBefore(row, prev); }
    else if (next && next.dataset.atom && offset > next.offsetHeight / 2) { offset -= next.offsetHeight; box.insertBefore(next, row); }
    row.style.transform = `translateY(${offset}px)`;
  };
  const up = async () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
    row.classList.remove('dragging'); row.style.transform = '';
    const ids = [...box.children].map(c => c.dataset.atom).filter(Boolean);
    await A.undoable('reorder', () => A.reorder(ids));
  };
  // listen on the document: moving the row in the page drops the handle's pointer capture
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
});

// ---------- timers: tick the visible clocks every second; finish them at zero ----------
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.1);
    });
  } catch { /* sound is optional */ }
}
setInterval(async () => {
  document.querySelectorAll('[data-timer]').forEach(el => {
    const left = A.timerLeft(el.dataset.timer);
    if (left !== null) el.textContent = Today.fmtClock(left);
  });
  const finished = await A.timerSweep();
  if (finished.length) { beep(); navigator.vibrate?.([120, 60, 120]); toast(`time's up · ${finished.join(', ')} ✓`); render(); }
}, 1000);

// sheet: close on backdrop tap
document.getElementById('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
document.getElementById('sheet').addEventListener('close', e => { if (!e.target.open) e.target.querySelector('.inner').innerHTML = ''; }); // (not if another sheet already opened)

// install prompt (Chrome/Android)
document.querySelector('header .hsearch').addEventListener('click', () => actions.search());
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (S.ui.route === 'sys') render(); });
window.addEventListener('online', () => { paintStatus(); render(); });
window.addEventListener('offline', () => { paintStatus(); render(); });
// roll over to a new day if the app stays open past midnight (and follow it if you were looking at "today")
function checkDay() {
  const now = M.todayKey();
  if (now === renderedDay) return;
  if (S.ui.date === renderedDay) S.ui.date = now;
  renderedDay = now; render();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDay(); });
setInterval(() => { checkDay(); if (S.ui.route === 'today' && S.ui.date === M.todayKey() && !document.getElementById('sheet').open) render(); }, 60000);

window.addEventListener('hashchange', go);
onChange(render);

(async () => {
  try {
    await load();
  } catch (err) {
    main.innerHTML = `<p class="overdue">&gt; storage unavailable: ${esc(err.message || err)}</p><p class="dim">private browsing can block on-device storage.</p>`;
    return;
  }
  paintStatus();
  typeTitle();
  go();
  Sync.onStatus(() => { if (S.ui.route === 'sys') render(); });
  Sync.start().catch(err => console.warn('sync start failed', err));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
