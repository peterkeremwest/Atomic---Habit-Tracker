// NOTES — things that don't belong to a day: books to read, recipes, quotes, reminders to yourself.
// Each note can have a checklist and some text. "Show on Today" puts it on the day screen every day.
import { S, live } from '../state.js';
import { foldSection } from '../ui.js';
import { noteCard } from './today.js';

export function render() {
  const notes = live(S.atoms).filter(a => a.kind === 'note');
  const pinned = notes.filter(n => n.pinned).length;
  const cards = notes.map(n => noteCard(n, { where: 'notes' })).join('');
  return `
    <p class="dim" style="font-size:14px;margin-top:4px">lists and notes that stay put: books to read, recipes, quotes, things to remind yourself.
      tap <span class="vt">☆ TODAY</span> on one to show it on the day screen every day.</p>
    <form class="inline" data-form="addnote">
      <input class="field" name="t" maxlength="400" placeholder="books to read: dune, piranesi" aria-label="New note. Write a title, or a title, a colon and items separated by commas." required>
      <button class="btn vt" type="submit">ADD</button>
    </form>
    <div class="actions" style="justify-content:flex-start;margin-top:8px"><button class="btn vt" data-action="newnote">+ NOTE WITH TEXT</button></div>
    ${notes.length ? foldSection('notes:all', 'NOTES', `${notes.length}${pinned ? ` · ${pinned} on Today` : ''}`, cards, S.ui.folded.has('notes:all'))
      : `<p class="empty" style="margin-top:16px">&gt; no notes yet. write a title above, or a title, a colon and a few items.</p>`}`;
}
