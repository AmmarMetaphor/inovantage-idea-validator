import { hashIp, isValidTokenShape, maskEmail, sha256Hex, shortRef } from '../crypto';
import type { Deps } from '../deps';
import type { Job, Order, Report } from '../db/types';
import { recoveryEmail } from '../emails';
import { fulfilCheckoutSession } from '../fulfil';
import { assertPilotDeliveryAllowed } from '../jobs';
import { clientIp, HttpError, isObject, json, readJson, requireMethod } from '../http';
import { checkAccessToken, mintAccessToken } from '../tokens';
import { enforceRateLimit } from './ratelimit';

export type PublicStage = 'paid' | 'researching' | 'compiling' | 'ready' | 'failed' | 'expired';

export function publicStage(order: Order, job: Job | null, report: Report | null, now: Date): PublicStage {
  if (order.report_expires_at && new Date(order.report_expires_at) <= now) return 'expired';
  if (order.status === 'fulfilled' || report?.status === 'delivered') return 'ready';
  if (order.status === 'failed' || job?.status === 'dead') return 'failed';
  switch (job?.stage) {
    case 'research':
      return 'researching';
    case 'compose':
    case 'render':
    case 'deliver':
      return 'compiling';
    case 'done':
      return 'ready';
    default:
      return 'paid';
  }
}

async function authorise(req: Request, deps: Deps, contextIp: string | undefined, route: string, limit: number) {
  requireMethod(req, 'POST');
  const ip = hashIp(clientIp(req, contextIp), deps.env.ipHashSalt);
  await enforceRateLimit(deps, `${route}:${ip}`, limit, 600);
  const body = await readJson<unknown>(req, 2048);
  if (!isObject(body) || !isValidTokenShape(body.token)) throw new HttpError(404, 'not_found', 'No report matches that link.');
  const check = await checkAccessToken(deps.db, body.token, deps.now());
  // One generic answer for unknown, expired and revoked tokens.
  if (!check.ok) throw new HttpError(404, 'not_found', 'No report matches that link. It may have expired; use "Find my report" to get a new one.');
  const order = await deps.db.getOrder(check.token.order_id);
  if (!order || (order.status !== 'paid' && order.status !== 'fulfilled' && order.status !== 'failed')) {
    throw new HttpError(404, 'not_found', 'No report matches that link.');
  }
  await deps.db.touchAccessToken(check.token.id, deps.now().toISOString());
  return { order, tokenId: check.token.id };
}

/** POST /api/report-status { token } → minimal status */
export async function reportStatus(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  const { order } = await authorise(req, deps, contextIp, 'status', 120);
  const [job, report] = await Promise.all([deps.db.getJobForOrder(order.id, 'report'), deps.db.getReport(order.id)]);
  const stage = publicStage(order, job, report, deps.now());
  return json({
    reportRef: shortRef(order.id),
    stage,
    orderedAt: order.created_at,
    expiresAt: order.report_expires_at,
    emailMasked: maskEmail(order.email),
    pdfAvailable: stage === 'ready' && !!report?.pdf_object_path,
  });
}

/** POST /api/report-download { token } → short-lived signed URL */
export async function reportDownload(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  const { order } = await authorise(req, deps, contextIp, 'download', 30);
  if (order.report_expires_at && new Date(order.report_expires_at) <= deps.now()) {
    throw new HttpError(410, 'expired', 'Access to this report has expired.');
  }
  const report = await deps.db.getReport(order.id);
  if (!report?.pdf_object_path || (report.status !== 'rendered' && report.status !== 'delivered')) {
    throw new HttpError(409, 'not_ready', 'The report is not ready yet.');
  }
  const url = await deps.blobs.createSignedUrl(report.pdf_object_path, 120);
  deps.log.info('report.download_url_issued', { order_id: order.id });
  return json({ url, expiresInSeconds: 120 });
}

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const RETURN_TOKEN_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * GET /api/checkout-result?session_id=cs_...
 * Never fulfils from the redirect alone: when the webhook has not landed yet
 * the session is retrieved from Stripe server-side and verified exactly as
 * in the webhook before anything is marked paid.
 */
export async function checkoutResult(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  requireMethod(req, 'GET');
  const ip = hashIp(clientIp(req, contextIp), deps.env.ipHashSalt);
  await enforceRateLimit(deps, `checkout-result:${ip}`, 60, 600);
  const sessionId = new URL(req.url).searchParams.get('session_id') ?? '';
  if (!SESSION_RE.test(sessionId)) throw new HttpError(400, 'invalid_session', 'Missing or invalid session reference.');

  let order = await deps.db.getOrderByCheckoutSession(sessionId);
  if (!order) throw new HttpError(404, 'not_found', 'No order matches that checkout.');

  if (order.status === 'pending_payment') {
    const session = await deps.payments.retrieveSession(sessionId);
    if (session && session.paymentStatus === 'paid') {
      const result = await fulfilCheckoutSession(
        { db: deps.db, log: deps.log, now: deps.now, expectedPriceId: deps.env.stripePriceId, reportAccessDays: deps.env.reportAccessDays, invokeWorker: deps.invokeWorker },
        session,
        'checkout_return',
      );
      if (result.outcome === 'fulfilled') order = result.order;
      else if (result.outcome === 'rejected') {
        deps.log.error('checkout_result.rejected', { reason: result.reason, order_id: result.orderId });
        return json({ state: 'rejected' }, 409);
      }
    }
  }

  if (order.status === 'paid' || order.status === 'fulfilled') {
    const paidAt = order.paid_at ? new Date(order.paid_at).getTime() : 0;
    if (deps.now().getTime() - paidAt > RETURN_TOKEN_WINDOW_MS) {
      return json({ state: 'paid', reportPath: null, message: 'Use the link in your confirmation email.' });
    }
    const link = await mintAccessToken(deps.db, { orderId: order.id, issuedVia: 'checkout_return', ttlDays: deps.env.tokenTtlDays, now: deps.now(), appUrl: deps.env.appUrl, notAfter: order.report_expires_at });
    return json({ state: 'paid', reportPath: link.statusPath, reportRef: shortRef(order.id) });
  }
  if (order.status === 'expired' || order.status === 'failed') return json({ state: order.status });
  return json({ state: 'pending' });
}

/** POST /api/recover-report { email } → always { ok: true } */
export async function recoverReport(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  requireMethod(req, 'POST');
  const ip = hashIp(clientIp(req, contextIp), deps.env.ipHashSalt);
  await enforceRateLimit(deps, `recover-ip:${ip}`, 5, 900);
  const body = await readJson<unknown>(req, 2048);
  const email = isObject(body) && typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
  const generic = json({ ok: true, message: 'If a report exists for that address, an email is on its way.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return generic;

  const emailNorm = email.toLowerCase();
  const perEmail = await deps.db.consumeRateLimit(`recover-email:${sha256Hex(emailNorm).slice(0, 32)}`, 3, 86_400);
  if (!perEmail.allowed) {
    deps.log.warn('recover.email_rate_limited');
    return generic;
  }

  const now = deps.now();
  const orders = await deps.db.findActiveOrdersByEmail(emailNorm, now.toISOString(), 3);
  if (!orders.length) {
    deps.log.info('recover.no_orders');
    return generic;
  }
  try {
    const links = [] as { statusUrl: string; ideaName: string; orderRef: string; orderId: string }[];
    let soonest = '';
    for (const order of orders) {
      const sub = await deps.db.getSubmission(order.submission_id);
      const link = await mintAccessToken(deps.db, { orderId: order.id, issuedVia: 'recovery', ttlDays: deps.env.recoveryTokenTtlDays, now, appUrl: deps.env.appUrl, notAfter: order.report_expires_at });
      links.push({ statusUrl: link.statusUrl, ideaName: sub?.idea_name ?? 'your idea', orderRef: shortRef(order.id), orderId: order.id });
      if (!soonest || link.record.expires_at < soonest) soonest = link.record.expires_at;
    }
    const mail = recoveryEmail({ links, expiresOn: soonest.slice(0, 10) });
    // Only ever to the address on the original order, never to the one typed in.
    const to = orders[0].email;
    for (const o of orders) assertPilotDeliveryAllowed(o, to, deps.env.pilotAllowedEmails);
    const { providerMessageId } = await deps.mailer.send({ to, ...mail });
    for (const l of links) await deps.db.recordDelivery({ order_id: l.orderId, job_id: null, kind: 'recovery', provider: 'resend', provider_message_id: providerMessageId, status: 'sent', error: null });
    deps.log.info('recover.sent', { orders: links.length });
  } catch (err) {
    deps.log.error('recover.failed', { err });
    for (const o of orders) await deps.db.recordDelivery({ order_id: o.id, job_id: null, kind: 'recovery', provider: 'resend', provider_message_id: null, status: 'failed', error: err instanceof Error ? err.message.slice(0, 500) : String(err) });
  }
  return generic;
}
