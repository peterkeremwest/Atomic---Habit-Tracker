// ACCOUNT sheet: sign in / create account / confirm email / reset password.
// Same Cognito account as Forge, so an existing Forge login works here too.
import * as auth from '../auth.js';
import * as sync from '../sync.js';
import { esc, openSheet, closeSheet, toast } from '../ui.js';

const field = (name, label, type = 'text', extra = '') =>
  `<label for="acc-${name}">${label}</label><input class="field" id="acc-${name}" name="${name}" type="${type}" ${extra}>`;
const EMAIL = v => field('email', 'EMAIL', 'email', `autocomplete="username" required value="${esc(v || '')}"`);
const PASS = (label = 'PASSWORD', ac = 'current-password') => field('password', label, 'password', `autocomplete="${ac}" required minlength="8"`);
const CODE = field('code', 'CODE FROM THE EMAIL', 'text', 'inputmode="numeric" autocomplete="one-time-code" required maxlength="10"');
const link = (x, text) => `<button type="button" class="linkbtn" data-go="${x}">${text}</button>`;

const SCREENS = {
  signin: v => ({ title: 'SIGN IN', note: 'use the same email and password as Forge, if you have a Forge account.',
    body: EMAIL(v.email) + PASS(), submit: 'SIGN IN', links: link('forgot', 'forgot password?') + link('signup', 'create an account') }),
  signup: v => ({ title: 'CREATE ACCOUNT', note: 'one account works in both Atomic and Forge. we will email you a code.',
    body: EMAIL(v.email) + PASS('PASSWORD (8 or more characters)', 'new-password'), submit: 'CREATE', links: link('signin', 'i already have an account') }),
  confirm: v => ({ title: 'CONFIRM EMAIL', note: `we sent a code to ${esc(v.email)}.`,
    body: CODE, submit: 'CONFIRM', links: link('resend', 'send a new code') + link('signin', 'back to sign in') }),
  forgot: v => ({ title: 'RESET PASSWORD', note: 'we will email you a code to set a new password.',
    body: EMAIL(v.email), submit: 'SEND CODE', links: link('signin', 'back to sign in') }),
  reset: v => ({ title: 'NEW PASSWORD', note: `enter the code sent to ${esc(v.email)} and a new password.`,
    body: CODE + PASS('NEW PASSWORD', 'new-password'), submit: 'SAVE PASSWORD', links: link('signin', 'back to sign in') }),
  newpass: () => ({ title: 'NEW PASSWORD', note: 'your account needs a new password before you can sign in.',
    body: PASS('NEW PASSWORD', 'new-password'), submit: 'SAVE PASSWORD', links: '' }),
};

export function openAccount(mode = 'signin', v = {}) {
  const sc = SCREENS[mode](v);
  openSheet(`<h2>${sc.title}</h2>
    <form class="form" id="accForm" autocomplete="on" novalidate>
      <p class="dim" style="font-size:13px;margin:0 0 4px">${sc.note}</p>
      ${sc.body}
      <p class="overdue" id="acc-err" role="alert" style="font-size:13px;min-height:1em;margin:8px 0 0"></p>
      <div class="actions"><button type="button" class="btn vt" data-x="cancel">CANCEL</button><button type="submit" class="btn solid vt">${sc.submit}</button></div>
      <div class="acclinks">${sc.links}</div>
    </form>`, root => {
    const f = root.querySelector('#accForm'), err = root.querySelector('#acc-err'), btn = f.querySelector('[type=submit]');
    const email = () => (f.email?.value || v.email || '').trim().toLowerCase();
    root.querySelector('[data-x=cancel]').onclick = closeSheet;
    root.querySelector('.acclinks').onclick = async e => {
      const go = e.target.closest('[data-go]')?.dataset.go; if (!go) return;
      if (go === 'resend') { try { await auth.resendCode(v.email); toast('new code sent'); } catch (x) { err.textContent = x.message; } return; }
      openAccount(go, { email: email() });
    };
    setTimeout(() => f.querySelector('input')?.focus(), 50);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!f.checkValidity()) { err.textContent = f.querySelector(':invalid')?.type === 'email' ? 'enter your email' : 'fill in every box (passwords need 8 or more characters)'; return; }
      err.textContent = ''; btn.disabled = true; const label = btn.textContent; btn.textContent = '…';
      try {
        if (mode === 'signin') {
          try { await auth.signIn(email(), f.password.value); }
          catch (x) {
            if (x.challenge) return openAccount('newpass', { email: email(), session: x.session });
            if (x.code === 'UserNotConfirmedException') { await auth.resendCode(email()).catch(() => {}); return openAccount('confirm', { email: email(), password: f.password.value }); }
            throw x;
          }
          return finish();
        }
        if (mode === 'signup') { await auth.signUp(email(), f.password.value); return openAccount('confirm', { email: email(), password: f.password.value }); }
        if (mode === 'confirm') {
          await auth.confirmSignUp(v.email, f.code.value.trim());
          if (v.password) { await auth.signIn(v.email, v.password); return finish(); }
          toast('email confirmed, now sign in'); return openAccount('signin', { email: v.email });
        }
        if (mode === 'forgot') { await auth.forgotPassword(email()); return openAccount('reset', { email: email() }); }
        if (mode === 'reset') {
          await auth.confirmForgotPassword(v.email, f.code.value.trim(), f.password.value);
          await auth.signIn(v.email, f.password.value); return finish();
        }
        if (mode === 'newpass') { await auth.setNewPassword(v.email, f.password.value, v.session); return finish(); }
      } catch (x) {
        err.textContent = x.message || 'something went wrong';
      } finally { btn.disabled = false; btn.textContent = label; }
    });
  });
}

async function finish() {
  closeSheet();
  toast(`signed in as ${auth.user()?.email || ''} · syncing…`);
  try {
    const cloudHad = await sync.afterSignIn();
    toast(cloudHad ? 'signed in · your cloud data is on this device now' : 'signed in · this device is now backed up to the cloud');
  } catch (x) {
    toast('signed in, but the first sync failed. it will try again');
  }
}

// SETTINGS > SIGN OUT
export async function askSignOut() {
  if (!confirm('Sign out? Your data stays in the cloud and is removed from this device, ready for the next sign-in.')) return;
  let r = await sync.signOutAndClear();
  if (r.left) {
    if (!confirm(`${r.left} change${r.left === 1 ? " hasn't" : "s haven't"} reached the cloud yet (offline or the back office is unreachable).\n\nSign out anyway and lose ${r.left === 1 ? 'it' : 'them'}?`)) return;
    r = await sync.signOutAndClear(true);
  }
  toast('signed out');
}
