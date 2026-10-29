import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env { DB: D1Database; ASSETS: Fetcher; GOOGLE_CLIENT_ID: string }
type Row = Record<string, unknown>;
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const day = 86_400_000;
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const error = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});
const hash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map(x => x.toString(16).padStart(2, '0')).join('');
const randomToken = () => crypto.randomUUID() + crypto.randomUUID();
const cookie = (value: string, request: Request, maxAge: number) => `dofiin_refresh=${value}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
const parseCookie = (request: Request) => request.headers.get('Cookie')?.match(/(?:^|;\s*)dofiin_refresh=([^;]+)/)?.[1] || '';
async function body(request: Request): Promise<Row | null> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  try { const value = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null; } catch { return null; }
}
async function authorized(request: Request, env: Env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE access_hash = ? AND expires_at > ?').bind(await hash(token), now()).first<{user_id: string}>();
  return session?.user_id || null;
}
async function issueSession(userId: string, request: Request, env: Env, oldId?: string) {
  const access = randomToken(), refresh = randomToken(), expires = new Date(Date.now() + 30 * day).toISOString();
  const statements = [];
  if (oldId) statements.push(env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(oldId));
  statements.push(env.DB.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)').bind(uid(), userId, await hash(access), await hash(refresh), expires, now()));
  await env.DB.batch(statements);
  return json({ access_token: access, token_type: 'bearer', expires_in: 1800 }, 200, { 'Set-Cookie': cookie(refresh, request, 30 * 86400) });
}
async function createDefaultProfiles(userId: string, env: Env) {
  const purchase = new Date(Date.now() - 365 * day).toISOString().slice(0, 10);
  const statements: D1PreparedStatement[] = [];
  for (const profile of [
    { name: 'Default', role: 'default', allocations: [['aapl', '0.45'], ['msft', '0.35'], ['nvda', '0.20']] },
    { name: 'Benchmark', role: 'benchmark', allocations: [['spy', '1.00']] },
  ] as const) {
    const portfolioId = uid(), versionId = uid(), created = now();
    statements.push(env.DB.prepare('INSERT INTO portfolios VALUES (?, ?, ?, NULL, ?, 1, NULL, ?)').bind(portfolioId, userId, profile.name, profile.role, created));
    statements.push(env.DB.prepare('INSERT INTO portfolio_versions VALUES (?, ?, 1, ?, ?, ?)').bind(versionId, portfolioId, purchase, '10000.00', created));
    for (const [instrumentId, weight] of profile.allocations) statements.push(env.DB.prepare('INSERT INTO allocations VALUES (?, ?, ?)').bind(versionId, instrumentId, weight));
  }
  await env.DB.batch(statements);
}
async function getVersion(env: Env, portfolioId: string, versionNumber?: number) {
  const version = await env.DB.prepare('SELECT * FROM portfolio_versions WHERE portfolio_id = ? AND version_number = COALESCE(?, (SELECT MAX(version_number) FROM portfolio_versions WHERE portfolio_id = ?))').bind(portfolioId, versionNumber ?? null, portfolioId).first<Row>();
  if (!version) return null;
  const allocations = (await env.DB.prepare('SELECT a.instrument_id, i.symbol, a.weight FROM allocations a JOIN instruments i ON i.id = a.instrument_id WHERE a.version_id = ? ORDER BY i.symbol').bind(version.id).all<Row>()).results;
  return { id: version.id, version_number: version.version_number, purchase_date: version.purchase_date, initial_capital: version.initial_capital, created_at: version.created_at, allocations };
}
async function getPortfolio(env: Env, userId: string, id: string, archived = false) {
  const row = await env.DB.prepare(`SELECT * FROM portfolios WHERE id = ? AND user_id = ? ${archived ? '' : 'AND archived_at IS NULL'}`).bind(id, userId).first<Row>();
  if (!row) return null;
  return { id: row.id, name: row.name, description: row.description, profile_role: row.profile_role, current_version: row.current_version, archived_at: row.archived_at, latest_version: await getVersion(env, id) };
}
async function allocationsFrom(input: Row, env: Env) {
  if (!Array.isArray(input.allocations) || !input.allocations.length) return null;
  const ids = new Set<string>();
  let total = 0;
  const items: { instrument_id: string; weight: string }[] = [];
  for (const raw of input.allocations) {
    if (!raw || typeof raw.instrument_id !== 'string' || typeof raw.weight !== 'string' || !/^\d+(?:\.\d{1,10})?$/.test(raw.weight)) return null;
    const weight = Number(raw.weight);
    if (weight <= 0 || weight > 1 || ids.has(raw.instrument_id)) return null;
    const asset = await env.DB.prepare('SELECT id FROM instruments WHERE id = ?').bind(raw.instrument_id).first();
    if (!asset) return null;
    ids.add(raw.instrument_id); total += weight;
    items.push({ instrument_id: raw.instrument_id, weight: raw.weight });
  }
  return total > 0 && total <= 1.00000001 ? items : null;
}
function validDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2018-01-01' && value <= now().slice(0, 10) && !Number.isNaN(Date.parse(value));
}
function validCapital(value: unknown) {
  return typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 1e9;
}
async function handle(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '');
  const method = request.method;
  if (path === '/health' && method === 'GET') return json({ status: 'ok' });
  if (path === '/public-config' && method === 'GET') return json({ google_client_id: env.GOOGLE_CLIENT_ID, demo_mode: true, analytics_enabled: false });
  if (path === '/auth/google/status' && method === 'GET') return json({ enabled: !!env.GOOGLE_CLIENT_ID });
  if (path === '/auth/google' && method === 'POST') {
    const input = await body(request);
    if (typeof input?.credential !== 'string') return error(400, 'INVALID_REQUEST', 'Google credential is required.');
    let identity: { sub: string; email: string; name: string };
    try {
      const verified = await jwtVerify(input.credential, jwks, { audience: env.GOOGLE_CLIENT_ID, issuer: ['accounts.google.com', 'https://accounts.google.com'] });
      const p = verified.payload;
      if (p.email_verified !== true || typeof p.email !== 'string' || typeof p.sub !== 'string') throw new Error('Google email is not verified.');
      identity = { sub: p.sub, email: p.email, name: typeof p.name === 'string' ? p.name : p.email };
    } catch { return error(401, 'INVALID_CREDENTIALS', 'Google sign-in could not be verified.'); }
    let user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(identity.sub).first<{ id: string }>();
    if (!user) {
      const userId = uid();
      await env.DB.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').bind(userId, identity.sub, identity.email, identity.name, now()).run();
      await createDefaultProfiles(userId, env);
      user = { id: userId };
    } else {
      await env.DB.prepare('UPDATE users SET email = ?, display_name = ? WHERE id = ?').bind(identity.email, identity.name, user.id).run();
    }
    return issueSession(user.id, request, env);
  }
  if (path === '/auth/refresh' && method === 'POST') {
    const refresh = parseCookie(request);
    if (!refresh) return error(401, 'UNAUTHORIZED', 'Session expired.');
    const session = await env.DB.prepare('SELECT id, user_id FROM sessions WHERE refresh_hash = ? AND expires_at > ?').bind(await hash(refresh), now()).first<{id: string; user_id: string}>();
    if (!session) return error(401, 'UNAUTHORIZED', 'Session expired.');
    return issueSession(session.user_id, request, env, session.id);
  }
  if (path === '/auth/logout' && method === 'POST') {
    const refresh = parseCookie(request);
    if (refresh) await env.DB.prepare('DELETE FROM sessions WHERE refresh_hash = ?').bind(await hash(refresh)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
  }
  const userId = await authorized(request, env);
  if (!userId) return error(401, 'UNAUTHORIZED', 'Please sign in.');
  if (path === '/users/me' && method === 'GET') {
    const user = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?').bind(userId).first<Row>();
    return user ? json({ ...user, has_password: false }) : error(401, 'UNAUTHORIZED', 'Please sign in.');
  }
  if (path === '/instruments' && method === 'GET') return json((await env.DB.prepare('SELECT * FROM instruments ORDER BY symbol').all()).results);
  if (path === '/portfolios' && method === 'GET') {
    const rows = (await env.DB.prepare("SELECT id FROM portfolios WHERE user_id = ? AND archived_at IS NULL ORDER BY CASE profile_role WHEN 'default' THEN 0 WHEN 'benchmark' THEN 1 ELSE 2 END, created_at, id").bind(userId).all<{id: string}>()).results;
    return json(await Promise.all(rows.map(row => getPortfolio(env, userId, row.id))));
  }
  if (path === '/portfolios' && method === 'POST') {
    const input = await body(request);
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !validDate(input.purchase_date) || !validCapital(input.initial_capital)) return error(422, 'VALIDATION_ERROR', 'Enter a valid name, purchase date, and starting capital.');
    const allocations = await allocationsFrom(input, env);
    if (!allocations) return error(422, 'VALIDATION_ERROR', 'Asset weights must total more than 0% and no more than 100%.');
    const portfolioId = uid(), versionId = uid(), created = now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO portfolios VALUES (?, ?, ?, NULL, NULL, 1, NULL, ?)').bind(portfolioId, userId, input.name.trim(), created),
      env.DB.prepare('INSERT INTO portfolio_versions VALUES (?, ?, 1, ?, ?, ?)').bind(versionId, portfolioId, input.purchase_date, input.initial_capital, created),
      ...allocations.map(a => env.DB.prepare('INSERT INTO allocations VALUES (?, ?, ?)').bind(versionId, a.instrument_id, a.weight)),
    ]);
    return json(await getPortfolio(env, userId, portfolioId), 201);
  }
  const match = path.match(/^\/portfolios\/([^/]+)(?:\/(configuration|versions|archive))?(?:\/(\d+))?$/);
  if (match) {
    const [, id, action, number] = match;
    const portfolio = await getPortfolio(env, userId, id, true);
    if (!portfolio) return error(404, 'NOT_FOUND', 'Portfolio not found.');
    if (action === 'versions' && method === 'GET') {
      if (number) {
        const version = await getVersion(env, id, Number(number));
        return version ? json(version) : error(404, 'NOT_FOUND', 'Version not found.');
      }
      const rows = (await env.DB.prepare('SELECT version_number FROM portfolio_versions WHERE portfolio_id = ? ORDER BY version_number DESC').bind(id).all<{version_number: number}>()).results;
      return json(await Promise.all(rows.map(row => getVersion(env, id, row.version_number))));
    }
    if (portfolio.archived_at) return error(409, 'PORTFOLIO_ARCHIVED', 'This portfolio is archived.');
    if (!action && method === 'GET') return json(portfolio);
    if (!action && method === 'PATCH') {
      const input = await body(request);
      if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) return error(422, 'VALIDATION_ERROR', 'Enter a portfolio name.');
      await env.DB.prepare('UPDATE portfolios SET name = ? WHERE id = ? AND user_id = ?').bind(input.name.trim(), id, userId).run();
      return json(await getPortfolio(env, userId, id));
    }
    if (action === 'configuration' && method === 'PUT') {
      const input = await body(request);
      if (!input || input.expected_version !== portfolio.current_version) return error(409, 'VERSION_CONFLICT', 'Portfolio changed. Reload before saving.');
      const purchase = input.purchase_date ?? portfolio.latest_version?.purchase_date;
      const capital = input.initial_capital ?? portfolio.latest_version?.initial_capital;
      if (!validDate(purchase) || !validCapital(capital)) return error(422, 'VALIDATION_ERROR', 'Enter a valid purchase date and starting capital.');
      const allocations = await allocationsFrom(input, env);
      if (!allocations) return error(422, 'VALIDATION_ERROR', 'Asset weights must total more than 0% and no more than 100%.');
      const versionId = uid(), version = Number(portfolio.current_version) + 1, created = now();
      await env.DB.batch([
        env.DB.prepare('UPDATE portfolios SET current_version = ? WHERE id = ? AND current_version = ?').bind(version, id, portfolio.current_version),
        env.DB.prepare('INSERT INTO portfolio_versions VALUES (?, ?, ?, ?, ?, ?)').bind(versionId, id, version, purchase, capital, created),
        ...allocations.map(a => env.DB.prepare('INSERT INTO allocations VALUES (?, ?, ?)').bind(versionId, a.instrument_id, a.weight)),
      ]);
      return json(await getPortfolio(env, userId, id));
    }
    if (action === 'archive' && method === 'POST') {
      if (portfolio.profile_role) return error(409, 'PROTECTED_PROFILE', 'Default profiles cannot be archived.');
      await env.DB.prepare('UPDATE portfolios SET archived_at = ? WHERE id = ? AND user_id = ?').bind(now(), id, userId).run();
      return json({ ok: true });
    }
  }
  return error(404, 'NOT_FOUND', 'This feature is not available in the Free demo.');
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/v1/')) return env.ASSETS.fetch(request);
    try { return await handle(request, env); }
    catch (cause) { console.error('Worker API error', cause); return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'); }
  },
} satisfies ExportedHandler<Env>;
