// Memoti on Cloudflare: the exported web app (static assets, ../dist) plus its
// API under /api.
//
//   POST /api/login  { username, password } → { token }, checked against the
//                    MEMOTI_USERNAME / MEMOTI_PASSWORD secrets
//   POST /api/query  { statements: [{ sql, params }] } → [{ rows }], runs the
//                    app's SQL (src/db/queries.ts) on D1; needs a session
//
// Sessions are stateless: the expiry signed with SESSION_SECRET. Rotating that
// secret signs every device out.
// ponytail: one account and a raw-SQL endpoint. Before anyone else gets an
// account: a users table, user_id on every row, and per-query routes.

const SESSION_DAYS = 90;
const encoder = new TextEncoder();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Constant-time string compare: hash both so the lengths always match. */
async function same(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map(async (s) => crypto.subtle.digest('SHA-256', encoder.encode(s)))
  );
  return crypto.subtle.timingSafeEqual(x, y);
}

const hmacKey = (secret) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
const toBase64Url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64Url = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function newSession(secret) {
  const expires = String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(expires));
  return `${expires}.${toBase64Url(signature)}`;
}

async function hasSession(request, secret) {
  const match = /^Bearer (\d+)\.([\w-]+)$/.exec(request.headers.get('Authorization') ?? '');
  if (!secret || !match || Number(match[1]) < Date.now()) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(match[2]),
      encoder.encode(match[1])
    );
  } catch {
    return false;
  }
}

async function login(request, env) {
  // Approximate and per Cloudflare location, but it turns password guessing
  // from thousands a second into a handful a minute.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
  if (!success) return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429);

  if (!env.MEMOTI_USERNAME || !env.MEMOTI_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: 'Sign-in is not set up yet.' }, 503);
  }
  const { username, password } = await request.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string') {
    return json({ error: 'Wrong username or password.' }, 401);
  }
  const [userOk, passOk] = await Promise.all([
    same(username.trim().toLowerCase(), env.MEMOTI_USERNAME.trim().toLowerCase()),
    same(password, env.MEMOTI_PASSWORD),
  ]);
  if (!userOk || !passOk) return json({ error: 'Wrong username or password.' }, 401);
  return json({ token: await newSession(env.SESSION_SECRET) });
}

async function query(request, env) {
  if (!(await hasSession(request, env.SESSION_SECRET))) {
    return json({ error: 'Signed out' }, 401);
  }
  // Several statements run as one atomic batch.
  const { statements } = await request.json();
  if (!Array.isArray(statements) || !statements.length) {
    return json({ error: 'No statements' }, 400);
  }
  const prepared = statements.map(({ sql, params = [] }) => env.DB.prepare(sql).bind(...params));
  const results =
    prepared.length === 1 ? [await prepared[0].all()] : await env.DB.batch(prepared);
  return json(results.map((r) => ({ rows: r.results ?? [] })));
}

export default {
  // Only /api/* reaches this (run_worker_first); everything else is the web app.
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    try {
      const { pathname } = new URL(request.url);
      if (pathname === '/api/login') return await login(request, env);
      if (pathname === '/api/query') return await query(request, env);
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  },
};
