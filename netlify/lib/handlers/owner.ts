/*
  Owner-only pilot endpoints.

  All of them require PILOT_MODE=true (otherwise 404, indistinguishable from
  a missing route). Login validates the password server-side with a
  constant-time compare and sets a signed, expiring, Secure/HttpOnly/
  SameSite=Strict cookie. Creating a pilot order needs that cookie, reuses
  the real submission validation and the real report pipeline, and is
  idempotent per submission.
*/
import { PRICE } from '../../../src/config/product';
import { hashIp, normaliseEmail, secretsEqual, sha256Hex, shortRef } from '../crypto';
import type { Deps } from '../deps';
import { loadEnv, type Env } from '../env';
import { clientIp, HttpError, isObject, json, readJson, requireMethod } from '../http';
import { clearCookie, createOwnerSession, OWNER_COOKIE, OWNER_SESSION_SECONDS, readCookie, sessionCookie, verifyOwnerSession } from '../session';
import { mintAccessToken } from '../tokens';
import { ANSWERS_VERSION } from '../../../src/questionnaire/schema';
import { MAX_BODY_BYTES, validateSubmission } from '../validation';
import { enforceRateLimit } from './ratelimit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pilotEnv(deps: Deps): Env {
  if (!deps.env.pilotMode) throw new HttpError(404, 'not_found', 'Not found.');
  return loadEnv(['pilot']);
}

function isSecure(req: Request, env: Env): boolean {
  return env.appUrl.startsWith('https://') || new URL(req.url).protocol === 'https:';
}

function requireOwner(req: Request, deps: Deps): { env: Env; expiresAt: Date } {
  const env = pilotEnv(deps);
  const check = verifyOwnerSession(readCookie(req, OWNER_COOKIE), env.pilotSessionSecret, deps.now());
  if (!check.ok) throw new HttpError(401, 'owner_session_required', 'Sign in on the owner page first.');
  return { env, expiresAt: check.expiresAt };
}

/** POST /api/owner-login { password } → sets cookie */
export async function ownerLogin(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  requireMethod(req, 'POST');
  const env = pilotEnv(deps);
  const ip = hashIp(clientIp(req, contextIp), env.ipHashSalt);
  await enforceRateLimit(deps, `owner-login:${ip}`, 5, 900);
  await enforceRateLimit(deps, 'owner-login:global', 50, 3600);

  const body = await readJson<unknown>(req, 2048);
  const password = isObject(body) && typeof body.password === 'string' ? body.password : '';
  if (!password || !secretsEqual(password, env.pilotOwnerPassword)) {
    deps.log.warn('owner.login_failed');
    throw new HttpError(401, 'invalid_password', 'That password is not correct.');
  }
  const session = createOwnerSession(env.pilotSessionSecret, deps.now());
  deps.log.info('owner.login_ok');
  return json(
    { ok: true, expiresAt: session.expiresAt.toISOString() },
    200,
    { 'set-cookie': sessionCookie(session.token, OWNER_SESSION_SECONDS, isSecure(req, env)) },
  );
}

/** POST /api/owner-logout → clears cookie */
export async function ownerLogout(req: Request, deps: Deps): Promise<Response> {
  requireMethod(req, 'POST');
  const env = pilotEnv(deps);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(isSecure(req, env)) });
}

/** GET /api/owner-session → { authenticated, ... } (never 500s on a bad cookie) */
export async function ownerSession(req: Request, deps: Deps): Promise<Response> {
  requireMethod(req, 'GET');
  const env = pilotEnv(deps);
  const check = verifyOwnerSession(readCookie(req, OWNER_COOKIE), env.pilotSessionSecret, deps.now());
  if (!check.ok) return json({ authenticated: false, pilotMode: true });
  return json({
    authenticated: true,
    pilotMode: true,
    expiresAt: check.expiresAt.toISOString(),
    allowedEmails: env.pilotAllowedEmails,
    generator: env.reportGenerator,
    model: env.anthropicModel,
    context: env.context,
  });
}

/** True when the request carries a valid owner session (used by the upgrade endpoint for pilot orders). */
export function hasOwnerSession(req: Request, deps: Deps): boolean {
  if (!deps.env.pilotMode) return false;
  try {
    const env = loadEnv(['pilot']);
    return verifyOwnerSession(readCookie(req, OWNER_COOKIE), env.pilotSessionSecret, deps.now()).ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/pilot-order { answers, clientRequestId? } → { reportPath, orderRef, created }
 * Validates like the public endpoint, stores the submission as source=pilot,
 * creates an explicit pilot order (amount 0, no Stripe ids, status
 * 'authorised', authorised_by owner_pilot), creates the durable job once,
 * kicks the worker, and hands the owner a report access token. It responds as
 * soon as the job row exists; it never waits for research, the PDF or email.
 * Repeat calls with the same clientRequestId return the same order and job
 * and never create a second job or email, so a client whose first response
 * was lost can retry safely.
 */
export async function createPilotOrder(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  requireMethod(req, 'POST');
  const { env } = requireOwner(req, deps);
  const ip = hashIp(clientIp(req, contextIp), env.ipHashSalt);
  await enforceRateLimit(deps, `pilot-order:${ip}`, 10, 3600);

  const body = await readJson<unknown>(req, MAX_BODY_BYTES);
  if (!isObject(body)) throw new HttpError(400, 'invalid_body');
  const result = validateSubmission(body.answers);
  if (!result.ok) throw new HttpError(400, 'validation_failed', 'Some answers are missing or invalid.', { errors: result.errors });
  const v = result.value;

  const emailNorm = normaliseEmail(v.email);
  if (!env.pilotAllowedEmails.includes(emailNorm)) {
    throw new HttpError(403, 'pilot_email_not_allowed', `During the pilot, reports can only be sent to: ${env.pilotAllowedEmails.join(', ')}.`);
  }

  const clientRequestId = typeof body.clientRequestId === 'string' && UUID_RE.test(body.clientRequestId) ? body.clientRequestId.toLowerCase() : null;
  const { submission } = await deps.db.createSubmission({
    email: v.email,
    email_normalised: emailNorm,
    market: v.market,
    currency: v.currency,
    idea_name: v.ideaName,
    answers: v.answers,
    answers_version: ANSWERS_VERSION,
    source: 'pilot',
    client_request_id: clientRequestId,
    ip_hash: ip,
    user_agent_hash: sha256Hex(req.headers.get('user-agent') ?? '').slice(0, 32),
  });
  if (submission.source !== 'pilot') throw new HttpError(409, 'not_pilot_submission', 'That submission belongs to the public checkout flow.');

  const { order, created: orderCreated } = await deps.db.createOrder({
    submission_id: submission.id,
    email: submission.email,
    email_normalised: submission.email_normalised,
    amount_minor: 0,
    currency: PRICE.currency,
    stripe_price_id: null,
    source: 'pilot',
    product: 'standard',
    parent_order_id: null,
  });
  if (order.source !== 'pilot') throw new HttpError(409, 'not_pilot_order', 'That submission already has a checkout order.');

  const now = deps.now();
  const reportExpiresAt = env.reportAccessDays > 0 ? new Date(now.getTime() + env.reportAccessDays * 86_400_000).toISOString() : null;
  // Pilot orders are authorised by the owner, never marked paid.
  const authorised = await deps.db.authoriseOrder({ orderId: order.id, authorisedBy: 'owner_pilot', now: now.toISOString(), reportExpiresAt });
  if (authorised.applied) await deps.db.setSubmissionStatus(submission.id, 'ordered');

  const { created: jobCreated, job } = await deps.db.createJob({ order_id: order.id, type: 'report' });
  if (jobCreated) {
    try {
      await deps.invokeWorker(job.id);
    } catch (err) {
      deps.log.warn('pilot.worker_invoke_failed', { job_id: job.id, err });
    }
  }
  const link = await mintAccessToken(deps.db, { orderId: order.id, issuedVia: 'pilot', ttlDays: env.tokenTtlDays, now, appUrl: env.appUrl, notAfter: reportExpiresAt });
  deps.log.info('pilot.order', { order_id: order.id, job_id: job.id, order_created: orderCreated, job_created: jobCreated });
  return json({ reportPath: link.statusPath, orderRef: shortRef(order.id), created: orderCreated && jobCreated, jobId: job.id }, orderCreated ? 201 : 200);
}
