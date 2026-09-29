// Atomic sign-in: the same raw Cognito REST calls Forge uses (no SDK, no build step).
// Tokens live in IndexedDB meta 'auth', separate from your items, so backups never contain them.
import { CLOUD } from './config.js';
import * as db from './db.js';

let AUTH = null; // { idToken, accessToken, refreshToken, expiresAt (ms), email, sub }

const endpoint = () => CLOUD.cognitoEndpoint || `https://cognito-idp.${CLOUD.region}.amazonaws.com/`;
async function cognito(action, body) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(friendly(data.__type, data.message));
    err.code = (data.__type || '').split('#').pop();
    throw err;
  }
  return data;
}
// Cognito's messages, in plain words
function friendly(type = '', msg = '') {
  const t = type.split('#').pop();
  if (t === 'NotAuthorizedException') return /refresh/i.test(msg) ? 'please sign in again' : 'wrong email or password';
  if (t === 'UserNotFoundException') return 'wrong email or password';
  if (t === 'UsernameExistsException') return 'that email already has an account. sign in instead (it works for Forge too)';
  if (t === 'CodeMismatchException') return 'that code is not right';
  if (t === 'ExpiredCodeException') return 'that code expired. ask for a new one';
  if (t === 'InvalidPasswordException') return (msg.split(':').pop() || 'password is too weak').trim().toLowerCase();
  if (t === 'LimitExceededException' || t === 'TooManyRequestsException') return 'too many tries. wait a few minutes';
  if (t === 'UserNotConfirmedException') return 'confirm your email first';
  return msg || 'something went wrong';
}
const claims = jwt => { try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };

async function keep(r, email, refreshToken) {
  const c = claims(r.IdToken);
  AUTH = { idToken: r.IdToken, accessToken: r.AccessToken, refreshToken: refreshToken || r.RefreshToken,
    expiresAt: Date.now() + r.ExpiresIn * 1000, email: email || c.email, sub: c.sub };
  await db.setMeta('auth', AUTH);
}

export async function loadAuth() { AUTH = await db.getMeta('auth', null); return AUTH; }
export const user = () => AUTH && { email: AUTH.email, sub: AUTH.sub };
export const signedIn = () => !!AUTH?.refreshToken;

export const signUp = (email, password) => cognito('SignUp', { ClientId: CLOUD.clientId, Username: email, Password: password, UserAttributes: [{ Name: 'email', Value: email }] });
export const confirmSignUp = (email, code) => cognito('ConfirmSignUp', { ClientId: CLOUD.clientId, Username: email, ConfirmationCode: code });
export const resendCode = email => cognito('ResendConfirmationCode', { ClientId: CLOUD.clientId, Username: email });
export const forgotPassword = email => cognito('ForgotPassword', { ClientId: CLOUD.clientId, Username: email });
export const confirmForgotPassword = (email, code, password) => cognito('ConfirmForgotPassword', { ClientId: CLOUD.clientId, Username: email, ConfirmationCode: code, Password: password });

export async function signIn(email, password) {
  const d = await cognito('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLOUD.clientId, AuthParameters: { USERNAME: email, PASSWORD: password } });
  if (d.ChallengeName === 'NEW_PASSWORD_REQUIRED') { const e = new Error('choose a new password'); e.challenge = d.ChallengeName; e.session = d.Session; throw e; }
  if (!d.AuthenticationResult) throw new Error('sign-in failed');
  await keep(d.AuthenticationResult, email);
}
export async function setNewPassword(email, password, session) {
  const d = await cognito('RespondToAuthChallenge', { ChallengeName: 'NEW_PASSWORD_REQUIRED', ClientId: CLOUD.clientId, Session: session, ChallengeResponses: { USERNAME: email, NEW_PASSWORD: password } });
  if (!d.AuthenticationResult) throw new Error('could not set the new password');
  await keep(d.AuthenticationResult, email);
}

// A fresh ID token for the API. Refreshes quietly when it's about to expire; signs out if the refresh token is dead.
export async function idToken() {
  if (!AUTH) return null;
  if (AUTH.expiresAt > Date.now() + 60_000) return AUTH.idToken;
  try {
    const d = await cognito('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: CLOUD.clientId, AuthParameters: { REFRESH_TOKEN: AUTH.refreshToken } });
    await keep(d.AuthenticationResult, AUTH.email, AUTH.refreshToken);
    return AUTH.idToken;
  } catch (err) {
    if (err.code === 'NotAuthorizedException') { AUTH = null; await db.setMeta('auth', null); }
    throw err;
  }
}

export async function signOut() {
  try { if (AUTH?.accessToken) await cognito('GlobalSignOut', { AccessToken: AUTH.accessToken }); } catch { /* best effort */ }
  AUTH = null; await db.setMeta('auth', null);
}
