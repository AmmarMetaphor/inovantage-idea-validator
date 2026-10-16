import { PRODUCTS } from '../../../src/config/product';
import { hashIp, isValidTokenShape, maskEmail, sha256Hex, shortRef } from '../crypto';
import type { Deps } from '../deps';
import { FULFILLABLE, type Job, type Order, type Report, type Submission } from '../db/types';
import { recoveryEmail } from '../emails';
import { fulfilCheckoutSession } from '../fulfil';
import { clientIp, HttpError, isObject, json, readJson, requireMethod } from '../http';
import { assertPilotDeliveryAllowed } from '../jobs';
import { computeFinancials } from '../finance';
import { StandardReportSchema, DetailedReportSchema } from '../report-schema';
import { checkAccessToken, mintAccessToken } from '../tokens';
import { hasOwnerSession } from './owner';
import { enforceRateLimit } from './ratelimit';

/* ---------------------------------------------------------------------------
   Public progress states, derived from actual backend records
--------------------------------------------------------------------------- */

export type PublicStage =
  // Stripe orders
  | 'confirming_payment'
  | 'payment_confirmed'
  // Pilot orders (no payment ever)
  | 'submission_received'
  | 'queued_for_research'
  // Shared
  | 'researching'
  | 'writing'
  | 'ready'
  | 'email_sent'
  | 'failed'
  | 'expired';

export const STAGE_LABELS: Record<PublicStage, string> = {
  confirming_payment: 'Confirming your payment',
  payment_confirmed: 'Payment confirmed',
  submission_received: 'Submission received',
  queued_for_research: 'Queued for research',
  researching: 'Researching',
  writing: 'Writing your report',
  ready: 'Report ready',
  email_sent: 'Email sent',
  failed: 'Needs attention',
  expired: 'Access ended',
};

export type JobState = 'none' | 'queued' | 'running' | 'retrying' | 'failed' | 'done';

export function jobState(job: Job | null): { state: JobState; attempts: number; nextRetryAt: string | null } {
  if (!job) return { state: 'none', attempts: 0, nextRetryAt: null };
  if (job.status === 'dead') return { state: 'failed', attempts: job.attempts, nextRetryAt: null };
  if (job.status === 'succeeded') return { state: 'done', attempts: job.attempts, nextRetryAt: null };
  if (job.status === 'running') return { state: 'running', attempts: job.attempts, nextRetryAt: null };
  if (job.attempts > 0 && job.last_error) return { state: 'retrying', attempts: job.attempts, nextRetryAt: job.run_after };
  return { state: 'queued', attempts: job.attempts, nextRetryAt: null };
}

/**
 * Derive the customer-facing stage from real records. Pilot orders never pass
 * through a payment stage: their first step is "Submission received".
 */
export function publicStage(order: Order, job: Job | null, report: Report | null, emailSent: boolean, confirmationSent: boolean, now: Date): PublicStage {
  const pilot = order.source === 'pilot';
  if (order.report_expires_at && new Date(order.report_expires_at) <= now) return 'expired';
  if (order.status === 'pending_payment') return pilot ? 'submission_received' : 'confirming_payment';
  if (order.status === 'failed' || job?.status === 'dead') return 'failed';
  const pdfReady = !!report?.pdf_object_path && (report.status === 'rendered' || report.status === 'delivered');
  if (pdfReady && emailSent) return 'email_sent';
  if (pdfReady) return 'ready';
  const running = job?.status === 'running';
  switch (job?.stage) {
    case 'research':
      // Research has been reached; until a worker is actually running it, the job is queued for research.
      return running ? 'researching' : pilot ? 'queued_for_research' : 'payment_confirmed';
    case 'compose':
    case 'render':
      return 'writing';
    case 'deliver':
    case 'done':
      return 'ready';
    default:
      if (pilot) return confirmationSent ? 'queued_for_research' : 'submission_received';
      return 'payment_confirmed';
  }
}

/* ---------------------------------------------------------------------------
   Token → entitlements (standard + optional detailed) for one submission
--------------------------------------------------------------------------- */

interface Entitlements {
  submission: Submission;
  standard: Order;
  upgrade: Order | null;
}

async function authorise(req: Request, deps: Deps, contextIp: string | undefined, route: string, limit: number) {
  requireMethod(req, 'POST');
  const ip = hashIp(clientIp(req, contextIp), deps.env.ipHashSalt);
  await enforceRateLimit(deps, `${route}:${ip}`, limit, 600);
  const body = await readJson<Record<string, unknown>>(req, 2048);
  if (!isObject(body) || !isValidTokenShape(body.token)) throw new HttpError(404, 'not_found', 'No report matches that link.');
  const check = await checkAccessToken(deps.db, body.token, deps.now());
  // One generic answer for unknown, expired and revoked tokens.
  if (!check.ok) throw new HttpError(404, 'not_found', 'No report matches that link. It may have been revoked or expired; use "Find my report" to get a new one.');
  const tokenOrder = await deps.db.getOrder(check.token.order_id);
  if (!tokenOrder) throw new HttpError(404, 'not_found', 'No report matches that link.');
  const orders = await deps.db.getOrdersBySubmission(tokenOrder.submission_id);
  const standard = orders.find((o) => o.product === 'standard') ?? null;
  const upgrade = orders.find((o) => o.product === 'upgrade') ?? null;
  const live = (o: Order | null) => !!o && (FULFILLABLE.includes(o.status) || o.status === 'failed');
  if (!standard || !live(standard)) throw new HttpError(404, 'not_found', 'No report matches that link.');
  const submission = await deps.db.getSubmission(tokenOrder.submission_id);
  if (!submission) throw new HttpError(404, 'not_found', 'No report matches that link.');
  await deps.db.touchAccessToken(check.token.id, deps.now().toISOString());
  const ent: Entitlements = { submission, standard, upgrade: upgrade && (live(upgrade) || upgrade.status === 'pending_payment') ? upgrade : null };
  return { ent, body, token: body.token };
}

async function tierStatus(deps: Deps, order: Order, kind: 'report' | 'detailed_report') {
  const [job, report, emailSent, confirmationSent] = await Promise.all([
    deps.db.getJobForOrder(order.id, 'report'),
    deps.db.getReport(order.id),
    deps.db.hasDelivery(order.id, kind),
    deps.db.hasDelivery(order.id, 'confirmation'),
  ]);
  const stage = publicStage(order, job, report, emailSent, confirmationSent, deps.now());
  return {
    stage,
    label: STAGE_LABELS[stage],
    pdfAvailable: !!report?.pdf_object_path && (report.status === 'rendered' || report.status === 'delivered'),
    /** The final report email was accepted by the email provider. */
    emailSent,
    /** The initial confirmation email was accepted (distinct from the report email). */
    confirmationEmailSent: confirmationSent,
    verdict: kind === 'report' ? (report?.verdict ?? null) : null,
    job: jobState(job),
  };
}

/** POST /api/report-status { token } → minimal status for both tiers */
export async function reportStatus(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  const { ent } = await authorise(req, deps, contextIp, 'status', 120);
  const standard = await tierStatus(deps, ent.standard, 'report');
  const detailed = ent.upgrade ? await tierStatus(deps, ent.upgrade, 'detailed_report') : null;
  return json({
    reportRef: shortRef(ent.standard.id),
    ideaName: ent.submission.idea_name,
    orderedAt: ent.standard.created_at,
    expiresAt: ent.standard.report_expires_at,
    emailMasked: maskEmail(ent.standard.email),
    isPilot: ent.standard.source === 'pilot',
    standard,
    detailed: detailed ? { ...detailed, purchased: ent.upgrade!.status !== 'pending_payment' } : null,
    upgrade: { price: PRODUCTS.upgrade.display, priceNote: PRODUCTS.upgrade.priceNote, available: !ent.upgrade || ent.upgrade.status === 'pending_payment' },
  });
}

/**
 * POST /api/report-content { token, tier } → structured report data.
 * The detailed tier is returned only when its order is paid and the report
 * exists; nothing premium is ever sent for an unpaid upgrade.
 */
export async function reportContent(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  const { ent, body } = await authorise(req, deps, contextIp, 'content', 120);
  const tier = body.tier === 'detailed' ? 'detailed' : 'standard';
  const order = tier === 'detailed' ? ent.upgrade : ent.standard;
  if (!order || order.status === 'pending_payment') throw new HttpError(402, 'not_purchased', 'The detailed report has not been purchased.');
  const report = await deps.db.getReport(order.id);
  if (!report?.content || report.status === 'generating') throw new HttpError(409, 'not_ready', 'The report is not ready yet.');
  if (tier === 'detailed') {
    const content = DetailedReportSchema.parse(report.content);
    return json({ tier, reportRef: shortRef(ent.standard.id), generatedAt: report.generated_at, content, financials: computeFinancials(toFinancialInputs(content.financial_inputs, ent.submission.currency)) });
  }
  const content = StandardReportSchema.parse(report.content);
  return json({ tier, reportRef: shortRef(ent.standard.id), generatedAt: report.generated_at, content, financials: computeFinancials(toFinancialInputs(content.financial_inputs, ent.submission.currency)) });
}

function toFinancialInputs(fi: { price: { value: number | null; unit: string; basis: 'customer_input' | 'assumption' | 'evidence'; note: string }; variable_cost: { value: number | null; unit: string; basis: 'customer_input' | 'assumption' | 'evidence'; note: string }; fixed_monthly: { value: number | null; basis: 'customer_input' | 'assumption' | 'evidence'; note: string }; volumes: { low: number; base: number; high: number; basis: 'customer_input' | 'assumption' | 'evidence'; note: string } }, currency: string) {
  return {
    currency,
    price: { value: fi.price.value, unit: fi.price.unit || 'sale', basis: fi.price.basis, note: fi.price.note },
    variableCost: { value: fi.variable_cost.value, unit: fi.variable_cost.unit || 'sale', basis: fi.variable_cost.basis, note: fi.variable_cost.note },
    fixedMonthly: { value: fi.fixed_monthly.value, unit: 'per month' as const, basis: fi.fixed_monthly.basis, note: fi.fixed_monthly.note },
    volumes: { ...fi.volumes },
  };
}

/** POST /api/report-download { token, tier } → fresh short-lived storage URL (repeatable, no customer deadline) */
export async function reportDownload(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  const { ent, body } = await authorise(req, deps, contextIp, 'download', 60);
  const tier = body.tier === 'detailed' ? 'detailed' : 'standard';
  const order = tier === 'detailed' ? ent.upgrade : ent.standard;
  if (!order || order.status === 'pending_payment') throw new HttpError(402, 'not_purchased', 'The detailed report has not been purchased.');
  if (order.report_expires_at && new Date(order.report_expires_at) <= deps.now()) throw new HttpError(410, 'expired', 'Access to this report has ended.');
  const report = await deps.db.getReport(order.id);
  if (!report?.pdf_object_path || (report.status !== 'rendered' && report.status !== 'delivered')) throw new HttpError(409, 'not_ready', 'The report is not ready yet.');
  // The storage URL is short-lived by design; the customer's stable link is the report page, which mints a new one on every click.
  const url = await deps.blobs.createSignedUrl(report.pdf_object_path, 120);
  deps.log.info('report.download_url_issued', { order_id: order.id, tier });
  return json({ url, tier });
}

/* ---------------------------------------------------------------------------
   Upgrade purchase
--------------------------------------------------------------------------- */

const CHECKOUT_TTL_SECONDS = 30 * 60;

/**
 * POST /api/create-upgrade-checkout { token } → { checkoutUrl } (Stripe) or
 * { reportPath } (pilot orders with an owner session). Idempotent per
 * submission: the upgrade order is unique on (submission, 'upgrade').
 */
export async function createUpgradeCheckout(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  const { ent } = await authorise(req, deps, contextIp, 'upgrade', 10);
  if (!FULFILLABLE.includes(ent.standard.status)) throw new HttpError(409, 'standard_not_paid', 'The standard report must be paid first.');
  if (ent.upgrade && ent.upgrade.status !== 'pending_payment' && ent.upgrade.status !== 'expired') throw new HttpError(409, 'already_purchased', 'The detailed report has already been purchased.');

  const product = PRODUCTS.upgrade;
  const now = deps.now();

  if (ent.standard.source === 'pilot') {
    if (!hasOwnerSession(req, deps)) throw new HttpError(403, 'pilot_owner_required', 'Pilot upgrades can only be started from the owner page session.');
    const { order } = await deps.db.createOrder({ submission_id: ent.submission.id, email: ent.standard.email, email_normalised: ent.standard.email_normalised, amount_minor: 0, currency: product.currency, stripe_price_id: null, source: 'pilot', product: 'upgrade', parent_order_id: ent.standard.id });
    await deps.db.authoriseOrder({ orderId: order.id, authorisedBy: 'owner_pilot', now: now.toISOString(), reportExpiresAt: ent.standard.report_expires_at });
    const { created, job } = await deps.db.createJob({ order_id: order.id, type: 'report' });
    if (created) await deps.invokeWorker(job.id).catch((err) => deps.log.warn('upgrade.worker_invoke_failed', { job_id: job.id, err }));
    deps.log.info('upgrade.pilot', { order_id: order.id, job_id: job.id, created });
    const link = await mintAccessToken(deps.db, { orderId: ent.standard.id, issuedVia: 'pilot', ttlDays: deps.env.tokenTtlDays, now, appUrl: deps.env.appUrl, notAfter: ent.standard.report_expires_at });
    return json({ reportPath: link.statusPath, pilot: true });
  }

  const payments = deps.payments; // throws a clear setup error when Stripe is not configured
  const priceId = deps.env.stripePriceIds.upgrade;
  await payments.verifyPrice(priceId, { amountMinor: product.amountMinor, currency: product.currency });
  const { order } = await deps.db.createOrder({ submission_id: ent.submission.id, email: ent.standard.email, email_normalised: ent.standard.email_normalised, amount_minor: product.amountMinor, currency: product.currency, stripe_price_id: priceId, source: 'stripe', product: 'upgrade', parent_order_id: ent.standard.id });
  if (order.status !== 'pending_payment' && order.status !== 'expired') throw new HttpError(409, 'already_purchased', 'The detailed report has already been purchased.');
  const session = await payments.createCheckoutSession({
    priceId,
    orderId: order.id,
    customerEmail: ent.standard.email,
    successUrl: `${deps.env.appUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${deps.env.appUrl}/checkout?status=cancelled&upgrade=1`,
    expiresAtUnix: Math.floor(now.getTime() / 1000) + CHECKOUT_TTL_SECONDS,
    idempotencyKey: `checkout:${order.id}:${order.stripe_checkout_session_id ?? 'first'}`,
  });
  await deps.db.attachCheckoutSession(order.id, session.id, new Date(session.expiresAtUnix * 1000).toISOString());
  if (order.status === 'expired') await deps.db.setOrderStatus(order.id, 'pending_payment');
  deps.log.info('upgrade.checkout_created', { order_id: order.id });
  return json({ checkoutUrl: session.url });
}

/* ---------------------------------------------------------------------------
   Checkout return (standard and upgrade)
--------------------------------------------------------------------------- */

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
        { db: deps.db, log: deps.log, now: deps.now, expectedPriceIds: deps.env.stripePriceIds, reportAccessDays: deps.env.reportAccessDays, invokeWorker: deps.invokeWorker },
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
      return json({ state: 'paid', product: order.product, reportPath: null, message: 'Use the link in your confirmation email.' });
    }
    // The link always points at the submission's report page (standard order), whichever product was just bought.
    const anchor = order.product === 'upgrade' && order.parent_order_id ? order.parent_order_id : order.id;
    const link = await mintAccessToken(deps.db, { orderId: anchor, issuedVia: 'checkout_return', ttlDays: deps.env.tokenTtlDays, now: deps.now(), appUrl: deps.env.appUrl, notAfter: order.report_expires_at });
    return json({ state: 'paid', product: order.product, reportPath: link.statusPath, reportRef: shortRef(anchor) });
  }
  if (order.status === 'expired' || order.status === 'failed') return json({ state: order.status, product: order.product });
  return json({ state: 'pending', product: order.product });
}

/* ---------------------------------------------------------------------------
   Link recovery
--------------------------------------------------------------------------- */

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
    for (const order of orders) {
      const sub = await deps.db.getSubmission(order.submission_id);
      const link = await mintAccessToken(deps.db, { orderId: order.id, issuedVia: 'recovery', ttlDays: deps.env.recoveryTokenTtlDays, now, appUrl: deps.env.appUrl, notAfter: order.report_expires_at });
      links.push({ statusUrl: link.statusUrl, ideaName: sub?.idea_name ?? 'your idea', orderRef: shortRef(order.id), orderId: order.id });
    }
    const mail = recoveryEmail({ links });
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
