// SYS — theme, backup, storage status, install.
import { S, live } from '../state.js';
import { APP_VERSION } from '../version.js';
import { esc } from '../ui.js';

export function render({ canInstall }) {
  const themes = ['green', 'amber', 'red'];
  return `<div class="sys">
    <div class="section vt"><span>// DISPLAY</span></div>
    <div class="seg" role="radiogroup" aria-label="Theme">
      ${themes.map(t => `<label><input type="radio" name="theme" value="${t}" ${S.settings.theme === t ? 'checked' : ''} data-action="theme"><span class="vt" style="font-size:20px">${t.toUpperCase()}</span></label>`).join('')}
    </div>
    <div class="seg" style="margin-top:8px">
      <label><input type="checkbox" ${S.settings.scanlines ? 'checked' : ''} data-action="scanlines"><span class="vt" style="font-size:20px">SCANLINES</span></label>
    </div>

    <div class="section vt"><span>// DATA</span></div>
    <div class="kv"><span>atoms</span><span>${live(S.atoms).length}</span></div>
    <div class="kv"><span>elements</span><span>${live(S.elements).length}</span></div>
    <div class="kv"><span>day logs</span><span>${S.logs.filter(l => !l.deletedAt).length}</span></div>
    <div class="kv"><span>waiting for cloud sync</span><span>${S.pending}</span></div>
    <p class="dim" style="font-size:13px">everything is stored on this device only. cloud sync (and syncing with Forge) comes in a later version; changes are already queued for it.</p>
    <div class="actions" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn vt" data-action="export">EXPORT BACKUP</button>
      <button class="btn vt" data-action="import">IMPORT BACKUP</button>
      <input type="file" id="importFile" accept="application/json,.json" class="hidden">
    </div>

    <div class="section vt"><span>// APP</span></div>
    <div class="kv"><span>version</span><span class="vt" style="font-size:20px">${esc(APP_VERSION)}</span></div>
    <div class="kv"><span>mode</span><span>${matchMedia('(display-mode: standalone)').matches ? 'installed' : 'browser'} · ${navigator.onLine ? 'online' : 'offline'}</span></div>
    ${canInstall ? `<div class="actions" style="justify-content:flex-start"><button class="btn solid vt" data-action="install">INSTALL APP</button></div>` : `<p class="dim" style="font-size:13px">to install: iPhone Safari → Share → Add to Home Screen. Android Chrome → menu → Install app.</p>`}
    <div class="actions" style="justify-content:flex-start;margin-top:28px">
      <button class="btn vt warn" data-action="reset">ERASE ALL DATA</button>
    </div>
  </div>`;
}
