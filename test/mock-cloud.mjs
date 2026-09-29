// Stand-in for Atomic's AWS back office, for browser tests: a fake Cognito (the few calls auth.js makes)
// plus the REAL data clerk (backend/src/data/data.js) over an in-memory table. Listens on :8766.
import http from 'node:http';
import { makeHandler } from '../backend/src/data/data.js';
import { fakeDdb } from './fake-ddb.mjs';

const ddb = fakeDdb();
const clerk = makeHandler(ddb, 'AtomicTable');
const users = new Map(); // email -> { password, confirmed, sub }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = u => `${b64({ alg: 'none' })}.${b64({ sub: u.sub, email: u.email, exp: Date.now() / 1000 + 3600 })}.sig`;
const result = u => ({ AuthenticationResult: { IdToken: token(u), AccessToken: 'acc-' + u.sub, RefreshToken: 'ref-' + u.sub, ExpiresIn: 3600 } });
const fail = (type, message) => ({ status: 400, body: { __type: type, message } });

function cognito(action, b) {
  const u = users.get(b.Username || b.AuthParameters?.USERNAME);
  switch (action) {
    case 'SignUp':
      if (users.has(b.Username)) return fail('UsernameExistsException', 'exists');
      users.set(b.Username, { email: b.Username, password: b.Password, confirmed: false, sub: 'sub-' + users.size });
      return { body: { UserConfirmed: false } };
    case 'ConfirmSignUp': if (b.ConfirmationCode !== '123456') return fail('CodeMismatchException', 'bad code'); u.confirmed = true; return { body: {} };
    case 'ResendConfirmationCode': return { body: {} };
    case 'InitiateAuth':
      if (b.AuthFlow === 'REFRESH_TOKEN_AUTH') { const r = [...users.values()].find(x => 'ref-' + x.sub === b.AuthParameters.REFRESH_TOKEN); return r ? { body: result(r) } : fail('NotAuthorizedException', 'Refresh Token has expired'); }
      if (!u || u.password !== b.AuthParameters.PASSWORD) return fail('NotAuthorizedException', 'Incorrect username or password.');
      if (!u.confirmed) return fail('UserNotConfirmedException', 'not confirmed');
      return { body: result(u) };
    case 'GlobalSignOut': return { body: {} };
    default: return fail('InvalidParameterException', 'unsupported ' + action);
  }
}

http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Amz-Target', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const send = (status, body) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let raw = ''; for await (const c of req) raw += c;
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__rows') return send(200, { rows: ddb.rows.size, users: users.size });
  const target = req.headers['x-amz-target'];
  if (target) { const r = cognito(target.split('.').pop(), JSON.parse(raw || '{}')); return send(r.status || 200, r.body); }
  // the JWT authorizer's job: check the bearer token, hand the clerk the verified sub
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
  let sub; try { sub = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url')).sub; } catch { return send(401, { message: 'Unauthorized' }); }
  const out = await clerk({ rawPath: url.pathname, queryStringParameters: Object.fromEntries(url.searchParams), body: raw,
    requestContext: { http: { method: req.method }, authorizer: { jwt: { claims: { sub } } } } });
  res.writeHead(out.statusCode, { ...cors, ...out.headers }); res.end(out.body);
}).listen(8766, () => console.log('mock cloud on :8766'));
