// SETTINGS — theme, backup, storage status, install.
import { S, live } from '../state.js';
import { APP_VERSION } from '../version.js';
import { esc } from '../ui.js';
import { cloudReady } from '../config.js';
import * as auth from '../auth.js';

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24); return `${d} day${d === 1 ? '' : 's'} ago`;
}
function account() {
  if (!cloudReady()) return `<p class="dim" style="font-size:13px">cloud sync isn't set up yet. everything is stored on this device only.</p>`;
  if (!auth.signedIn()) return `<p class="dim" style="font-size:13px">sign in to back up to the cloud and use Atomic on more than one device. a Forge account works here too.</p>
    <div class="actions" style="justify-content:flex-start"><button class="btn solid vt" data-action="signin">SIGN IN</button><button class="btn vt" data-action="signup">CREATE ACCOUNT</button></div>`;
  const y = S.sync;
  const status = y.state === 'syncing' ? 'syncing…'
    : y.state === 'offline' ? `offline · ${S.pending} change${S.pending === 1 ? '' : 's'} waiting`
    : y.state === 'error' ? `couldn't sync (${esc(y.error || 'unknown')}) · will try again`
    : y.lastAt ? `synced ${ago(y.lastAt)}${S.pending ? ` · ${S.pending} waiting` : ''}` : 'not synced yet';
  return `<div class="kv"><span>signed in as</span><span>${esc(auth.user()?.email || '')}</span></div>
    <div class="kv"><span>cloud</span><span class="${y.state === 'error' ? 'overdue' : ''}">${status}</span></div>
    <div class="actions" style="justify-content:flex-start"><button class="btn vt" data-action="syncnow">SYNC NOW</button><button class="btn vt" data-action="signout">SIGN OUT</button></div>`;
}

export function render({ canInstall }) {
  const themes = ['green', 'amber', 'red', 'pink'];
  return `<div class="sys">
    <div class="section vt"><span>// ACCOUNT</span></div>
    ${account()}

    <div class="section vt"><span>// DISPLAY</span></div>
    <div class="seg" role="radiogroup" aria-label="Theme">
      ${themes.map(t => `<label><input type="radio" name="theme" value="${t}" ${S.settings.theme === t ? 'checked' : ''} data-action="theme"><span class="vt" style="font-size:20px">${t.toUpperCase()}</span></label>`).join('')}
    </div>
    <div class="seg" style="margin-top:8px">
      <label><input type="checkbox" ${S.settings.scanlines ? 'checked' : ''} data-action="scanlines"><span class="vt" style="font-size:20px">SCANLINES</span></label>
    </div>

    <div class="section vt"><span>// DATA</span></div>
    <div class="kv"><span>items</span><span>${live(S.atoms).length}</span></div>
    <div class="kv"><span>categories</span><span>${live(S.elements).length}</span></div>
    <div class="kv"><span>habit check-ins</span><span>${S.logs.filter(l => !l.deletedAt && l.status).length}</span></div>
    <div class="kv"><span>waiting for cloud sync</span><span>${S.pending}</span></div>
    <p class="dim" style="font-size:13px">${auth.signedIn() ? 'everything is saved on this device first, then copied to the cloud when you are online.' : 'everything is stored on this device. changes are queued, ready for when you sign in.'} syncing with Forge comes in a later version.</p>
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
