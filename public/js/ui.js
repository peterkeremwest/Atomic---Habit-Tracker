// Atomic — small shared UI helpers.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Bottom sheet built on <dialog>. mount(root) wires the content's own handlers.
export function openSheet(html, mount) {
  const d = document.getElementById('sheet');
  d.querySelector('.inner').innerHTML = html;
  if (!d.open) d.showModal();
  mount?.(d.querySelector('.inner'));
}
export function closeSheet() {
  const d = document.getElementById('sheet');
  if (d.open) d.close();
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
