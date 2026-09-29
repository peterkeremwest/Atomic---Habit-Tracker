// CATEGORIES — life areas (stored as "elements") and their subcategories (stored as "isotopes").
import { S, live, isotopesOf, atomsInElement } from '../state.js';
import * as M from '../model.js';
import { esc } from '../ui.js';

export function render() {
  const els = live(S.elements);
  return `
    <p class="dim" style="font-size:14px">tag anything you add with a category, like <span class="tag">#fitness</span>
      or <span class="tag">#fitness/cardio</span>. typing a tag that doesn't exist yet creates it.</p>
    ${els.map(e => {
      const isos = isotopesOf(e.id);
      const n = atomsInElement(e.id).length;
      const open = S.ui.openEl === e.id;
      return `<div class="el">
        <button data-action="openel" data-id="${e.id}" aria-expanded="${open}">
          <span class="info">${esc(e.name)}<small>${esc(M.tagOf(e.name))} · ${n} item${n === 1 ? '' : 's'} · ${isos.length} subcategor${isos.length === 1 ? 'y' : 'ies'}</small></span>
          <span class="dim vt" style="font-size:22px">${open ? '▾' : '▸'}</span>
        </button>
        ${open ? `<div class="panel">
          <div class="isos">${isos.length ? isos.map(i => `<span class="iso">${esc(i.name)}<button data-action="deliso" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">×</button></span>`).join('') : '<span class="dim" style="font-size:14px">no subcategories yet</span>'}</div>
          <form class="inline" data-form="addiso" data-id="${e.id}">
            <input class="field" name="t" maxlength="30" placeholder="new subcategory" aria-label="New subcategory name" required>
            <button class="btn vt" type="submit">ADD</button>
          </form>
          <div class="actions">
            <button class="btn vt" data-action="editel" data-id="${e.id}">RENAME</button>
            <button class="btn vt warn" data-action="delel" data-id="${e.id}">DELETE</button>
          </div>
        </div>` : ''}
      </div>`;
    }).join('')}
    <div class="section vt"><span>// NEW CATEGORY</span></div>
    <form class="inline" data-form="addel">
      <input class="field" name="t" maxlength="30" placeholder="name, e.g. Studies" aria-label="Category name" required>
      <button class="btn vt" type="submit">ADD</button>
    </form>`;
}
