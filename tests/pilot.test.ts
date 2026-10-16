import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from '../netlify/lib/env';
import * as owner from '../netlify/lib/handlers/owner';
import { createCheckout, createSubmission, reportDownload, reportStatus } from './api';
import { errorResponse } from '../netlify/lib/http';
import { runJob } from '../netlify/lib/jobs';
import { OWNER_COOKIE } from '../netlify/lib/session';
import type { Deps } from '../netlify/lib/deps';
import { get, makeHarness, post, TEST_ENV, validAnswers, type Harness } from './helpers';

const PILOT_ENV = {
  PILOT_MODE: 'true',
  PILOT_OWNER_PASSWORD: 'correct horse battery staple',
  PILOT_SESSION_SECRET: 's'.repeat(48),
};
const ALLOWED = 'support@metaphorconsultants.com';

type H = (req: Request, deps: Deps, ip?: string) => Promise<Response>;
const wrap = (fn: H): H => async (req, deps, ip) => {
  try {
    return await fn(req, deps, ip);
  } catch (err) {
    return errorResponse(err, deps.log);
  }
};
const ownerLogin = wrap(owner.ownerLogin);
const ownerSession = wrap(owner.ownerSession);
const ownerLogout = wrap(owner.ownerLogout);
const pilotOrder = wrap(owner.createPilotOrder);

function pilotHarness(extra: Record<string, string> = {}) {
  const h = makeHarness({ ...PILOT_ENV, ...extra });
  // Handlers call loadEnv(['pilot']) from process.env; mirror the harness env there.
  Object.assign(process.env, TEST_ENV, PILOT_ENV, extra);
  return h;
}

async function login(h: Harness, password = PILOT_ENV.PILOT_OWNER_PASSWORD) {
  const res = await ownerLogin(post('/api/owner-login', { password }), h.deps);
  const cookie = res.headers.get('set-cookie') ?? '';
  return { res, cookie, cookieHeader: cookie.split(';')[0] };
}

function jobDeps(h: Harness) {
  return {
    db: h.db, blobs: h.blobs, mailer: h.mailer, generator: h.generator, log: h.deps.log, now: h.deps.now,
    appUrl: 'https://app.test', tokenTtlDays: 30, heartbeatMs: 60_000, pilotAllowedEmails: [ALLOWED],
    renderStandard: async () => ({ pdf: Buffer.from('%PDF-1.4 pilot'), pageCount: 2 }),
  };
}

describe('Pilot mode gating', () => {
  it('is off by default: owner endpoints look like missing routes', async () => {
    const h = makeHarness();
    Object.assign(process.env, TEST_ENV, { PILOT_MODE: '' });
    delete process.env.PILOT_MODE;
    expect((await ownerSession(get('/api/owner-session'), h.deps)).status).toBe(404);
    expect((await ownerLogin(post('/api/owner-login', { password: 'x' }), h.deps)).status).toBe(404);
    expect((await pilotOrder(post('/api/pilot-order', { answers: validAnswers(ALLOWED) }), h.deps)).status).toBe(404);
  });

  it('requires a strong password and session secret when enabled', () => {
    expect(() => loadEnv(['pilot'], { IP_HASH_SALT: 's', PILOT_MODE: 'true', PILOT_OWNER_PASSWORD: 'short', PILOT_SESSION_SECRET: 's'.repeat(40) })).toThrowError(ConfigError);
    expect(() => loadEnv(['pilot'], { IP_HASH_SALT: 's', PILOT_MODE: 'true', PILOT_OWNER_PASSWORD: 'long enough password', PILOT_SESSION_SECRET: 'short' })).toThrowError(/PILOT_SESSION_SECRET/);
    expect(() => loadEnv(['pilot'], { IP_HASH_SALT: 's', PILOT_OWNER_PASSWORD: 'long enough password', PILOT_SESSION_SECRET: 's'.repeat(40) })).toThrowError(/PILOT_MODE/);
  });

  it('defaults the delivery allowlist to the support address', () => {
    const env = loadEnv([], { IP_HASH_SALT: 's' });
    expect(env.pilotAllowedEmails).toEqual([ALLOWED]);
  });
});

describe('Owner login and session', () => {
  it('rejects a wrong password without setting a cookie, and rate limits', async () => {
    const h = pilotHarness();
    const bad = await login(h, 'wrong password here');
    expect(bad.res.status).toBe(401);
    expect(bad.cookie).toBe('');
    for (let i = 0; i < 4; i += 1) await login(h, 'wrong password here');
    const limited = await login(h, PILOT_ENV.PILOT_OWNER_PASSWORD);
    expect(limited.res.status).toBe(429);
  });

  it('sets an expiring Secure HttpOnly SameSite=Strict cookie on success', async () => {
    const h = pilotHarness();
    const { res, cookie } = await login(h);
    expect(res.status).toBe(200);
    expect(cookie).toMatch(new RegExp(`^${OWNER_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toMatch(/Max-Age=7200/);
    const body = (await res.json()) as { expiresAt: string };
    expect(new Date(body.expiresAt).getTime() - h.clock.now.getTime()).toBe(2 * 3_600_000);
  });

  it('a forged or expired cookie is not a session', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    const ok = await ownerSession(get('/api/owner-session', { cookie: cookieHeader }), h.deps);
    expect(((await ok.json()) as { authenticated: boolean }).authenticated).toBe(true);
    const forged = await ownerSession(get('/api/owner-session', { cookie: `${OWNER_COOKIE}=${cookieHeader.split('=')[1].replace(/.$/, 'A')}` }), h.deps);
    expect(((await forged.json()) as { authenticated: boolean }).authenticated).toBe(false);
    h.clock.advance(3 * 3_600_000);
    const expired = await ownerSession(get('/api/owner-session', { cookie: cookieHeader }), h.deps);
    expect(((await expired.json()) as { authenticated: boolean }).authenticated).toBe(false);
  });

  it('logout clears the cookie', async () => {
    const h = pilotHarness();
    const res = await ownerLogout(post('/api/owner-logout', {}), h.deps);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});

describe('Pilot orders', () => {
  it('needs a session', async () => {
    const h = pilotHarness();
    const res = await pilotOrder(post('/api/pilot-order', { answers: validAnswers(ALLOWED) }), h.deps);
    expect(res.status).toBe(401);
    expect(h.db.orders.size).toBe(0);
  });

  it('refuses any delivery address outside the allowlist', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    const res = await pilotOrder(post('/api/pilot-order', { answers: validAnswers('someone@example.com') }, { cookie: cookieHeader }), h.deps);
    expect(res.status).toBe(403);
    expect(h.db.submissions.size).toBe(0);
    expect(h.db.orders.size).toBe(0);
  });

  it('creates an explicit, unpaid pilot order, one job, kicks the worker, and returns a report link', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    const res = await pilotOrder(post('/api/pilot-order', { answers: validAnswers(ALLOWED), clientRequestId: '11111111-1111-4111-8111-111111111111' }, { cookie: cookieHeader }), h.deps);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { reportPath: string; created: boolean };
    expect(body.created).toBe(true);
    expect(body.reportPath).toMatch(/^\/report\/[A-Za-z0-9_-]{43}$/);
    const order = [...h.db.orders.values()][0];
    expect(order.source).toBe('pilot');
    expect(order.amount_minor).toBe(0);
    expect(order.authorised_by).toBe('owner_pilot');
    expect(order.stripe_payment_intent_id).toBeNull();
    expect(order.stripe_checkout_session_id).toBeNull();
    expect(order.status).toBe('paid');
    expect(h.db.jobs.size).toBe(1);
    expect(h.workerCalls.length).toBe(1);
    // The owner's link works like a customer's: no account, status then download.
    const token = body.reportPath.replace('/report/', '');
    const status = await reportStatus(post('/api/report-status', { token }), h.deps);
    expect(((await status.json()) as { standard: { stage: string } }).standard.stage).toBe('payment_confirmed');
  });

  it('a duplicate submission (same clientRequestId) never creates a second order, job or email', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    const payload = { answers: validAnswers(ALLOWED), clientRequestId: '22222222-2222-4222-8222-222222222222' };
    const first = await pilotOrder(post('/api/pilot-order', payload, { cookie: cookieHeader }), h.deps);
    const second = await pilotOrder(post('/api/pilot-order', payload, { cookie: cookieHeader }), h.deps);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { created: boolean }).created).toBe(false);
    expect(h.db.submissions.size).toBe(1);
    expect(h.db.orders.size).toBe(1);
    expect(h.db.jobs.size).toBe(1);
    expect(h.workerCalls.length).toBe(1);
    // Run the pipeline twice: stage checks keep emails at exactly two.
    const job = [...h.db.jobs.values()][0];
    await runJob(jobDeps(h), job.id, 'w1');
    await runJob(jobDeps(h), job.id, 'w2');
    expect(h.mailer.sent.length).toBe(2);
  });

  it('runs the real pipeline stages for a pilot order and delivers only to the allowlist', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    await pilotOrder(post('/api/pilot-order', { answers: validAnswers(ALLOWED) }, { cookie: cookieHeader }), h.deps);
    const job = [...h.db.jobs.values()][0];
    const out = await runJob(jobDeps(h), job.id, 'w1');
    expect(out.status).toBe('succeeded');
    expect(h.mailer.sent.map((m) => m.to)).toEqual([ALLOWED, ALLOWED]);
    expect(h.mailer.sent[1].attachments?.[0].filename).toMatch(/\.pdf$/);
    const order = [...h.db.orders.values()][0];
    const report = (await h.db.getReport(order.id))!;
    expect(h.blobs.objects.has(report.pdf_object_path!)).toBe(true);
    // The emailed link's token opens status and download.
    const token = /\/report\/([A-Za-z0-9_-]{43})/.exec(h.mailer.sent[1].text)![1];
    const dl = await reportDownload(post('/api/report-download', { token }), h.deps);
    expect(dl.status).toBe(200);
    expect(((await dl.json()) as { url: string }).url).toContain(report.pdf_object_path!);
    expect(report.page_count).toBe(2);
  });

  it('the pipeline refuses to email a pilot order to a non-allowlisted address even if the row was altered', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    await pilotOrder(post('/api/pilot-order', { answers: validAnswers(ALLOWED) }, { cookie: cookieHeader }), h.deps);
    const order = [...h.db.orders.values()][0];
    order.email = 'leak@example.com';
    const job = [...h.db.jobs.values()][0];
    const out = await runJob(jobDeps(h), job.id, 'w1');
    expect(out.status).toBe('dead');
    expect(h.mailer.sent.length).toBe(0);
    expect(h.generator.researchCalls).toBe(0);
  });

  it('a pilot submission cannot be pushed through checkout, and checkout fails safely without Stripe', async () => {
    const h = pilotHarness();
    const { cookieHeader } = await login(h);
    await pilotOrder(post('/api/pilot-order', { answers: validAnswers(ALLOWED), clientRequestId: '33333333-3333-4333-8333-333333333333' }, { cookie: cookieHeader }), h.deps);
    const submissionId = [...h.db.submissions.values()][0].id;
    const res = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    expect(res.status).toBe(409);
    // Stripe not configured at all: the payments getter throws a setup error, never a fake session.
    const noStripe = makeHarness();
    Object.defineProperty(noStripe.deps, 'payments', { get() { throw new ConfigError(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID']); } });
    const sub = await createSubmission(post('/api/create-submission', { answers: validAnswers() }), noStripe.deps);
    const { submissionId: publicId } = (await sub.json()) as { submissionId: string };
    const co = await createCheckout(post('/api/create-checkout', { submissionId: publicId }), noStripe.deps);
    expect(co.status).toBe(503);
    expect(await co.json()).toMatchObject({ error: 'not_configured' });
    expect(noStripe.db.orders.size).toBe(0);
  });

  it('public submissions are idempotent on clientRequestId too', async () => {
    const h = makeHarness();
    const payload = { answers: validAnswers(), clientRequestId: '44444444-4444-4444-8444-444444444444' };
    const a = (await (await createSubmission(post('/api/create-submission', payload), h.deps)).json()) as { submissionId: string };
    const b = (await (await createSubmission(post('/api/create-submission', payload), h.deps)).json()) as { submissionId: string };
    expect(a.submissionId).toBe(b.submissionId);
    expect(h.db.submissions.size).toBe(1);
  });
});

describe('Migrations: row level security', () => {
  const tables = ['submissions', 'orders', 'jobs', 'research_sources', 'reports', 'report_claims', 'access_tokens', 'webhook_events', 'delivery_attempts', 'rate_limits'];
  it('every table is created and locked down, and the pilot migration only adds', () => {
    const core = readFileSync('supabase/migrations/20261014000100_core_schema.sql', 'utf8');
    const security = readFileSync('supabase/migrations/20261014000200_security.sql', 'utf8');
    const pilot = readFileSync('supabase/migrations/20261015000500_pilot_orders.sql', 'utf8');
    for (const t of tables) {
      expect(core).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
      expect(security).toContain(`'${t}'`);
    }
    expect(security).toContain('enable row level security');
    expect(security).toContain('force row level security');
    expect(security).toMatch(/revoke all on table public\.%I from anon, authenticated/);
    expect(pilot).not.toMatch(/create table|drop table|disable row level security|create policy|grant /i);
  });
});
