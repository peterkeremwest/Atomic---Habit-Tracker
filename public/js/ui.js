// Atomic — small shared UI helpers.
import { cleanUrl } from './model.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Text with any web addresses turned into tappable links (http, https and www. only). Everything else stays escaped text.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
export function linkify(text) {
  return esc(text).replace(URL_RE, m => {
    let url = m.split(/&(?:quot|#39|lt|gt);/)[0].replace(/[.,;:!?)\]]+$/, ''); // stop at a quote, drop trailing punctuation
    const rest = m.slice(url.length);
    const href = /^www\./i.test(url) ? 'https://' + url : url;
    let shown = url.replace(/&amp;/g, '&').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (shown.length > 34) shown = shown.slice(0, 33) + '…';
    return `<a class="ilink" href="${href}" target="_blank" rel="noopener noreferrer">${esc(shown)}</a>${rest}`;
  });
}
// The "▶ store.com" button on a list or note that has a link of its own
export function linkChip(url) {
  let host = 'link';
  try { host = new URL(url).hostname.replace(/^www\./, '') || host; } catch { /* keep "link" */ }
  return `<a class="chiplink vt" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open link to ${esc(host)}">▶ ${esc(host)}</a>`;
}
// Sheet for adding, changing or removing a list's link. onSave(url) gets '' when it is removed.
export function openLinkSheet({ title, current = '', onSave }) {
  openSheet(`<h2>LINK FOR ${esc(String(title).toUpperCase())}</h2>
    <form class="form" id="linkForm" autocomplete="off">
      <p class="dim" style="font-size:13px;margin:0 0 4px">a web address, like a shopping list in another app. it shows as a button on the list.</p>
      <label for="lk-url">WEB ADDRESS</label>
      <input class="field" id="lk-url" name="u" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="https://" value="${esc(current)}">
      <p class="overdue" id="lk-err" role="alert" style="font-size:13px;min-height:1em;margin:8px 0 0"></p>
      <div class="actions"><button type="button" class="btn vt" data-x="cancel">CANCEL</button>
        ${current ? '<button type="button" class="btn vt warn" data-x="remove">REMOVE</button>' : ''}<button type="submit" class="btn solid vt">SAVE</button></div>
    </form>`, root => {
    const f = root.querySelector('#linkForm'), err = root.querySelector('#lk-err');
    root.querySelector('[data-x=cancel]').onclick = closeSheet;
    const rm = root.querySelector('[data-x=remove]');
    if (rm) rm.onclick = async () => { closeSheet(); await onSave(''); };
    setTimeout(() => f.u.focus(), 50);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const url = cleanUrl(f.u.value);
      if (url === null) { err.textContent = "that doesn't look like a web address"; return; }
      closeSheet(); await onSave(url);
    });
  });
}

// ---------- v0.2.7: the box that opens under a list item ----------
// Tap an item and a box opens below it with the item's own link (OPEN goes to the browser). Which box is open is
// remembered here, so a repaint (for example after saving a link) keeps it open without replaying the animation.
let openBoxKey = null;
export const getOpenBox = () => openBoxKey;
export const setOpenBox = k => { openBoxKey = k; };
// the link is typed right inside the box. Which box is being edited (and what was typed so far) also survives a repaint.
let editLinkKey = null, linkDraft = '';
export const getEditLink = () => editLinkKey;
export const setEditLink = (k, draft = '') => { editLinkKey = k; linkDraft = draft; };
export const setLinkDraft = v => { linkDraft = v; };
const isWebLink = u => /^https?:\/\/[^\s/]+/i.test(String(u || ''));
export function shortLink(url) {
  const s = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  return s.length > 46 ? s.slice(0, 45) + '…' : s;
}
// the item's text: tapping it opens or closes its box. A small ↗ shows that the item has a link.
export const itemText = i => `<span class="itxt tap" role="button" tabindex="0" aria-expanded="${openBoxKey === i.id}" data-action="itembox" data-key="${esc(i.id)}">${linkify(i.text)}${isWebLink(i.link) ? '<span class="lmark vt" aria-hidden="true">↗</span>' : ''}</span>`;
// the box itself. ownerId is the list / note / task the item is in (for a shared list, the item's own id).
export function itemBox(i, ownerId, shared = false) {
  const has = isWebLink(i.link);
  const editing = editLinkKey === i.id;
  const ids = `data-id="${esc(ownerId)}"${shared ? '' : ` data-item="${esc(i.id)}"`}`;
  return `<div class="ibox ${openBoxKey === i.id ? 'open' : ''}" data-box="${esc(i.id)}"><div class="iboxc"><div class="ibox-in ${editing ? 'editing' : ''}">
    <div class="iview">
      ${has ? `<a class="iopen" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer"><span class="vt">OPEN ↗</span><span class="ihost">${esc(shortLink(i.link))}</span></a>` : '<p class="dim inone">no link on this item yet</p>'}
      <div class="ibar"><button class="btn vt" data-action="itemlinkedit" ${ids}>${has ? 'CHANGE LINK' : '+ ADD A LINK'}</button></div>
    </div>
    <form class="iedit" data-form="itemlink" ${ids} autocomplete="off">
      <input class="field" name="u" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="https://" value="${esc(editing ? linkDraft : (has ? i.link : ''))}" aria-label="Web address for ${esc(i.text)}">
      <p class="overdue ierr" role="alert"></p>
      <div class="ibar"><button type="submit" class="btn solid vt">SAVE</button>${has ? `<button type="button" class="btn vt warn" data-action="itemlinkrm" ${ids}>REMOVE</button>` : ''}<button type="button" class="btn vt" data-action="itemlinkx" ${ids}>CANCEL</button></div>
    </form>
  </div></div></div>`;
}

// Edit one item of a list, note, task steps, expense list or shared list. onSave(text) returns an error message to
// keep the sheet open, or nothing when it saved. onRemove (optional) adds a REMOVE button.
export function openItemEdit({ label = 'ITEM', value = '', hint = '', maxlength = 200, onSave, onRemove }) {
  openSheet(`<h2>EDIT ${esc(label)}</h2>
    <form class="form" id="itemForm" autocomplete="off">
      ${hint ? `<p class="dim" style="font-size:13px;margin:0 0 4px">${esc(hint)}</p>` : ''}
      <label for="it-text">${esc(label)}</label>
      <input class="field" id="it-text" name="t" maxlength="${maxlength}" required value="${esc(value)}">
      <p class="overdue" id="it-err" role="alert" style="font-size:13px;min-height:1em;margin:8px 0 0"></p>
      <div class="actions"><button type="button" class="btn vt" data-x="cancel">CANCEL</button>
        ${onRemove ? '<button type="button" class="btn vt warn" data-x="remove">REMOVE</button>' : ''}<button type="submit" class="btn solid vt">SAVE</button></div>
    </form>`, root => {
    const f = root.querySelector('#itemForm'), err = root.querySelector('#it-err');
    root.querySelector('[data-x=cancel]').onclick = closeSheet;
    const rm = root.querySelector('[data-x=remove]');
    if (rm) rm.onclick = async () => { closeSheet(); await onRemove(); };
    setTimeout(() => { f.t.focus(); f.t.select(); }, 50);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = await onSave(f.t.value);
      if (msg) { err.textContent = msg; return; }
      closeSheet();
    });
  });
}

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
