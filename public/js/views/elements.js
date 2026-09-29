// ELEMENTS — life areas (Elements) and their subcategories (Isotopes).
import { S, live, isotopesOf, atomsInElement } from '../state.js';
import { esc } from '../ui.js';

export function render() {
  const els = live(S.elements);
  return `
    <p class="dim" style="font-size:14px">elements are your life areas. isotopes are the teams inside them.
      use the symbol when adding atoms: <span class="tag">#Fi</span> or <span class="tag">#Fi.cardio</span></p>
    ${els.map(e => {
      const isos = isotopesOf(e.id);
      const n = atomsInElement(e.id).length;
      const open = S.ui.openEl === e.id;
      return `<div class="el">
        <button data-action="openel" data-id="${e.id}" aria-expanded="${open}">
          <span class="sym glow">${esc(e.symbol)}</span>
          <span class="info">${esc(e.name)}<small>${isos.length} isotope${isos.length === 1 ? '' : 's'} · ${n} atom${n === 1 ? '' : 's'}</small></span>
          <span class="dim vt" style="font-size:22px">${open ? '▾' : '▸'}</span>
        </button>
        ${open ? `<div class="panel">
          <div class="isos">${isos.length ? isos.map(i => `<span class="iso">${esc(i.name)}<button data-action="deliso" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">×</button></span>`).join('') : '<span class="dim" style="font-size:14px">no isotopes yet</span>'}</div>
          <form class="inline" data-form="addiso" data-id="${e.id}">
            <input class="field" name="name" maxlength="30" placeholder="new isotope" aria-label="New isotope name" required>
            <button class="btn vt" type="submit">+ ADD</button>
          </form>
          <div class="actions">
            <button class="btn vt" data-action="editel" data-id="${e.id}">EDIT</button>
            <button class="btn vt warn" data-action="delel" data-id="${e.id}">DELETE</button>
          </div>
        </div>` : ''}
      </div>`;
    }).join('')}
    <div class="section vt"><span>// NEW ELEMENT</span></div>
    <form class="inline" data-form="addel">
      <input class="field vt" name="symbol" maxlength="2" placeholder="Sy" aria-label="Symbol" style="max-width:70px;font-size:22px" required>
      <input class="field" name="name" maxlength="30" placeholder="name, e.g. Studies" aria-label="Element name" required>
      <button class="btn vt" type="submit">+ ADD</button>
    </form>`;
}
