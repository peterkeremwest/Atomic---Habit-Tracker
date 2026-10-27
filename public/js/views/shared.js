// SHARED LISTS — the card on Today, its menu, and the invite / join sheets.
// A shared list belongs to exactly two people; both have full control; each checked item shows who checked it.
import * as A from '../state.js';
import * as Shared from '../shared.js';
import * as Sync from '../sync.js';
import * as Auth from '../auth.js';
import * as db from '../db.js';
import { cloudReady } from '../config.js';
import { esc, openSheet, closeSheet, toast, linkChip, openLinkSheet, itemText, itemBox } from '../ui.js';
import { openAccount } from './account.js';

export function sharedCard(l) {
  const items = Shared.itemsOf(l.id);
  const done = items.filter(i => i.done).length;
  const all = items.length > 0 && done === items.length;
  const other = Shared.partnerOf(l);
  return `<div class="listcard sharedcard ${all ? 'done' : ''}">
    <div class="row ${all ? 'done' : ''}" data-shared="${l.id}">
      <svg class="duo" viewBox="0 0 24 16" width="26" height="18" fill="none" stroke="currentColor" stroke-width="1.5" role="img" aria-label="Shared list"><circle cx="8" cy="5" r="3"/><path d="M2 15c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="6" r="2.5"/><path d="M13.5 10.2c.9-.5 2-.7 3.5-.7 2.8 0 5 2 5 5.5"/></svg>
      <div class="body">
        <button class="title" data-action="smenu" data-id="${l.id}">${esc(l.title)}</button>
        <div class="meta"><span>${other ? 'with ' + esc(other.name) : 'only you so far · tap ⋯ to invite'}</span><span>${done} of ${items.length} checked</span>${l.link ? linkChip(l.link) : ''}</div>
      </div>
      <button class="more" data-action="smenu" data-id="${l.id}" aria-label="More options for ${esc(l.title)}">⋯</button>
    </div>
    <ul class="items">${items.map(i => `<li class="hb ${i.done ? 'done' : ''}"><div class="irow">
      <button class="chk small vt" data-action="sitem" data-id="${i.id}" aria-label="${i.done ? 'Uncheck' : 'Check'} ${esc(i.text)}" aria-pressed="${i.done}">[<span class="mark">${i.done ? '✓' : '&nbsp;'}</span>]</button>
      ${itemText(i)}${i.done ? `<span class="by">${esc(Shared.whoChecked(l, i))}</span>` : ''}
      <button class="ed vt" data-action="sedit" data-id="${i.id}" aria-label="Edit ${esc(i.text)}">✎</button><button class="rm vt" data-action="sremove" data-id="${i.id}" aria-label="Remove ${esc(i.text)}">×</button></div>${itemBox(i, i.id, true)}</li>`).join('')}
    </ul>
    <form class="additem" data-form="addsitem" data-id="${l.id}"><input class="field" name="t" maxlength="200" placeholder="+ add item" aria-label="Add item to ${esc(l.title)}" autocomplete="off"></form>
  </div>`;
}

// plain words for whatever went wrong
const plain = e => e.fromClerk ? e.message : e.message === 'you need to be online for this' ? e.message : "couldn't reach the back office. try again in a moment";

export function openSharedMenu(id) {
  const l = Shared.listById(id);
  if (!l) return;
  const other = Shared.partnerOf(l);
  const rows = [];
  if (!other) rows.push(['invite', 'Invite someone to this list']);
  rows.push(['rename', 'Rename'], ['link', l.link ? 'Change or remove link' : 'Add a link']);
  if (Shared.itemsOf(id).some(i => i.done)) rows.push(['clear', 'Remove checked items']);
  rows.push(['leave', 'Leave this list'], ['delete', other ? `Delete for both of us` : 'Delete']);
  openSheet(`<h2>${esc(l.title)}</h2>
    <p class="dim" style="margin:-6px 0 8px;font-size:13px">${other ? 'shared with ' + esc(other.name) : 'only you are on this list so far'}</p>
    <div class="menu">${rows.map(([x, label]) => `<button data-x="${x}" class="${x === 'delete' || x === 'leave' ? 'warn' : ''}">${esc(label)}</button>`).join('')}</div>`, root => {
    root.querySelector('.menu').addEventListener('click', async e => {
      const x = e.target.closest('button')?.dataset.x;
      if (!x) return;
      if (x === 'invite') return openInvite(l);
      if (x === 'rename') return openRename(l);
      if (x === 'link') return openLinkSheet({ title: l.title, current: l.link || '', onSave: async url => { await A.undoable('slink', () => Shared.setLink(l.id, url)); toast(url ? 'link saved' : 'link removed', { undo: true }); } });
      closeSheet();
      if (x === 'clear') {
        const n = await A.undoable('sclear', () => Shared.clearChecked(id));
        return toast(`${n} checked item${n === 1 ? '' : 's'} removed`, { undo: true });
      }
      if (x === 'delete') {
        if (!confirm(`Delete "${l.title}"${other ? ` for you and ${other.name}` : ''}?`)) return;
        await A.undoable('sdel', () => Shared.deleteList(id));
        return toast('list deleted', { undo: true });
      }
      if (x === 'leave') {
        if (!confirm(`Leave "${l.title}"?${other ? ` ${other.name} keeps it, and you can only come back with a new code from them.` : ' Nobody else is on it, so it will be deleted.'}`)) return;
        try { await Sync.leaveList(id); toast('you left the list'); } catch (err) { toast(plain(err)); }
      }
    });
  });
}

function openRename(l) {
  openSheet(`<h2>RENAME LIST</h2>
    <form class="form" id="renForm" autocomplete="off">
      <label for="sl-name">NAME</label>
      <input class="field" id="sl-name" name="t" maxlength="80" required value="${esc(l.title)}">
      <div class="actions"><button type="button" class="btn vt" data-x="cancel">CANCEL</button><button type="submit" class="btn solid vt">SAVE</button></div>
    </form>`, root => {
    const f = root.querySelector('#renForm');
    root.querySelector('[data-x=cancel]').onclick = closeSheet;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!f.t.value.trim()) return;
      await Shared.renameList(l.id, f.t.value); closeSheet(); toast('renamed');
    });
  });
}

function openInvite(l) {
  openSheet(`<h2>INVITE TO ${esc(l.title.toUpperCase())}</h2><p class="dim">making a code…</p>`, async root => {
    try {
      const { code } = await Sync.inviteCode(l.id);
      const link = `${location.origin}${location.pathname}#/join/${code}`;
      root.innerHTML = `<h2>INVITE TO ${esc(l.title.toUpperCase())}</h2>
        <p class="dim" style="font-size:13px">send this to the one person you want to share the list with. it works once and expires in 2 days. they need an Atomic or Forge account.</p>
        <div class="joincode vt" aria-label="Code ${code.split('').join(' ')}">${code.slice(0, 4)} ${code.slice(4)}</div>
        <div class="actions" style="flex-wrap:wrap">
          <button class="btn vt" data-x="copycode">COPY CODE</button>
          <button class="btn solid vt" data-x="link">${navigator.share ? 'SHARE LINK' : 'COPY LINK'}</button>
          <button class="btn vt" data-x="done">DONE</button>
        </div>
        <p class="dim" style="font-size:13px">or they can open SETTINGS → JOIN WITH A CODE and type it in.</p>`;
      const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast(text); } };
      root.querySelector('[data-x=copycode]').onclick = () => copy(code, 'code');
      root.querySelector('[data-x=done]').onclick = closeSheet;
      root.querySelector('[data-x=link]').onclick = async () => {
        if (navigator.share) { try { await navigator.share({ title: 'Join my list on Atomic', text: `Join "${l.title}" on Atomic`, url: link }); } catch { /* cancelled */ } }
        else copy(link, 'link');
      };
    } catch (err) {
      root.innerHTML = `<h2>INVITE</h2><p class="overdue" role="alert">${esc(plain(err))}</p><div class="actions"><button class="btn vt" data-x="done">OK</button></div>`;
      root.querySelector('[data-x=done]').onclick = closeSheet;
    }
  });
}

export async function openJoin(code = '') {
  const ready = cloudReady() && Auth.signedIn();
  if (code && !ready) await db.setMeta('pendingJoin', code); // pick this up again right after signing in
  openSheet(`<h2>JOIN A SHARED LIST</h2>
    ${!cloudReady() ? `<p class="dim" style="font-size:13px">cloud sync isn't set up, so shared lists aren't available.</p>`
      : ready ? `<p class="dim" style="font-size:13px">type the code the other person sent you.</p>`
      : `<p class="dim" style="font-size:13px">sign in first (an Atomic or Forge account works). you'll come right back here.</p>`}
    <form class="form" id="joinForm" autocomplete="off">
      <label for="j-code">CODE</label>
      <input class="field vt" id="j-code" name="code" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(code)}" ${ready ? 'required' : 'disabled'} style="font-size:22px;letter-spacing:.1em">
      <p class="overdue" id="j-err" role="alert" style="font-size:13px;min-height:1em;margin:8px 0 0"></p>
      <div class="actions"><button type="button" class="btn vt" data-x="cancel">CANCEL</button>
        ${ready ? `<button type="submit" class="btn solid vt">JOIN</button>` : cloudReady() ? `<button type="button" class="btn solid vt" data-x="signin">SIGN IN</button>` : ''}</div>
    </form>`, root => {
    const f = root.querySelector('#joinForm'), err = root.querySelector('#j-err');
    root.querySelector('[data-x=cancel]').onclick = async () => { await db.setMeta('pendingJoin', null); closeSheet(); };
    const si = root.querySelector('[data-x=signin]');
    if (si) si.onclick = () => openAccount('signin');
    if (ready) setTimeout(() => f.code.focus(), 50);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); if (!btn || !f.code.value.trim()) return;
      err.textContent = ''; btn.disabled = true; btn.textContent = '…';
      try {
        const list = await Sync.joinWithCode(f.code.value.trim());
        await db.setMeta('pendingJoin', null);
        closeSheet();
        const other = list.members.find(m => m.sub !== Auth.user()?.sub);
        toast(`joined ${list.title}${other ? ' · shared with ' + other.name : ''}`);
        location.hash = '#/today';
      } catch (x) { err.textContent = plain(x); btn.disabled = false; btn.textContent = 'JOIN'; }
    });
  });
}

// after signing in: carry on with a join link that was opened while signed out
export async function resumeJoin() {
  const code = await db.getMeta('pendingJoin', null);
  if (!code) return;
  await db.setMeta('pendingJoin', null);
  openJoin(code);
}
