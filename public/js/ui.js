// Atomic — small shared UI helpers.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer, undoHandler = null;
export const setUndoHandler = fn => { undoHandler = fn; };
// toast('saved', { undo: true }) shows an UNDO button for 5 seconds
export function toast(msg, { undo = false } = {}) {
  const t = document.getElementById('toast');
  t.innerHTML = '';
  t.append(document.createTextNode(msg));
  if (undo && undoHandler) {
    const b = document.createElement('button');
    b.className = 'undo vt'; b.textContent = 'UNDO';
    b.onclick = async () => { t.classList.remove('show'); await undoHandler(); };
    t.append(b);
  }
  t.classList.toggle('hasaction', undo);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2200);
}

// Bottom sheet built on <dialog>. mount(root) wires the content's own handlers.
export function openSheet(html, mount) {
  const d = document.getElementById('sheet');
  const inner = d.querySelector('.inner');
  inner.onclick = null; // the previous sheet's tap handler must not leak into this one
  inner.innerHTML = html;
  if (!d.open) d.showModal();
  mount?.(d.querySelector('.inner'));
}
export function closeSheet() {
  const d = document.getElementById('sheet');
  if (d.open) d.close();
}

// Foldable section: tapping the header folds it; the "//" tips over and lies flat as "=" while folded.
export function foldSection(key, label, count, inner, folded) {
  return `<section class="sec ${folded ? 'folded' : ''}" data-sec="${key}">
    <button class="section vt" data-action="fold" data-sec="${key}" aria-expanded="${!folded}">
      <span><span class="slashes" aria-hidden="true"><i></i><i></i></span> ${label}</span><span>${count}</span></button>
    <div class="secbody"><div class="secinner">${inner}</div></div>
  </section>`;
}

// ASCII progress bar text, e.g. [#####-----]
export const asciiBar = (done, total, width = 10) => {
  const n = total ? Math.round((done / total) * width) : 0;
  return '[' + '#'.repeat(n) + '-'.repeat(width - n) + ']';
};

// Long-press on any element matching selector → cb(el). A short tap still fires click normally.
export function onLongPress(root, selector, cb, ms = 480) {
  let timer = null, startX = 0, startY = 0, target = null;
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.drag, .items, .additem')) return;
    target = e.target.closest(selector);
    if (!target) return;
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      target.dataset.longpressed = '1';
      navigator.vibrate?.(15);
      cb(target);
    }, ms);
  });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel(); });
  root.addEventListener('contextmenu', e => { if (e.target.closest(selector)) e.preventDefault(); });
  // swallow the click that follows a long press
  root.addEventListener('click', e => {
    const el = e.target.closest(selector);
    if (el?.dataset.longpressed) { delete el.dataset.longpressed; e.stopPropagation(); e.preventDefault(); }
  }, true);
}
