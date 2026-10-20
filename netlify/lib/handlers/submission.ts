import { PRODUCTS } from '../../../src/config/product';
import { hashIp, normaliseEmail, sha256Hex, shortRef } from '../crypto';
import type { Deps } from '../deps';
import { clientIp, HttpError, isObject, json, readJson, requireMethod } from '../http';
import { ANSWERS_VERSION } from '../../../src/questionnaire/schema';
import { openCheckoutSession } from '../checkout';
import { MAX_BODY_BYTES, validateSubmission } from '../validation';
import { enforceRateLimit } from './ratelimit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBMISSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** POST /api/create-submission  { answers, website? } → { submissionId } */
export async function createSubmission(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  requireMethod(req, 'POST');
  const ip = hashIp(clientIp(req, contextIp), deps.env.ipHashSalt);
  await enforceRateLimit(deps, `submission:${ip}`, 10, 3600);

  const body = await readJson<unknown>(req, MAX_BODY_BYTES);
  if (!isObject(body)) throw new HttpError(400, 'invalid_body');
  // Honeypot: real browsers leave this empty. Bots that fill it get a
  // plausible-looking failure rather than a hint.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    throw new HttpError(400, 'validation_failed', 'Please check your answers.', { errors: {} });
  }

  const result = validateSubmission(body.answers);
  if (!result.ok) throw new HttpError(400, 'validation_failed', 'Some answers are missing or invalid.', { errors: result.errors });

  const v = result.value;
  const clientRequestId = typeof body.clientRequestId === 'string' && UUID_RE.test(body.clientRequestId) ? body.clientRequestId.toLowerCase() : null;
  const { submission, created } = await deps.db.createSubmission({
    email: v.email,
    email_normalised: normaliseEmail(v.email),
    market: v.market,
    currency: v.currency,
    idea_name: v.ideaName,
    answers: v.answers,
    answers_version: ANSWERS_VERSION,
    source: 'public',
    client_request_id: clientRequestId,
    ip_hash: ip,
    user_agent_hash: sha256Hex(req.headers.get('user-agent') ?? '').slice(0, 32),
  });
  deps.log.info(created ? 'submission.created' : 'submission.deduplicated', { submission_id: submission.id, market: v.market });
  return json({ submissionId: submission.id }, created ? 201 : 200);
}

/** POST /api/create-checkout  { submissionId } → { checkoutUrl, orderRef } */
export async function createCheckout(req: Request, deps: Deps, contextIp?: string): Promise<Response> {
  requireMethod(req, 'POST');
  const ip = hashIp(clientIp(req, contextIp), deps.env.ipHashSalt);
  await enforceRateLimit(deps, `checkout:${ip}`, 10, 3600);

  const body = await readJson<unknown>(req, 4096);
  if (!isObject(body) || typeof body.submissionId !== 'string' || !UUID_RE.test(body.submissionId)) {
    throw new HttpError(400, 'invalid_body', 'submissionId is required.');
  }
  // Anything price-related in the body is ignored on purpose: the server owns the price.

  const submission = await deps.db.getSubmission(body.submissionId);
  if (!submission) throw new HttpError(404, 'submission_not_found', 'That submission does not exist or has expired.');
  if (submission.status === 'paid') throw new HttpError(409, 'already_paid', 'This submission has already been paid for.');
  if (deps.now().getTime() - new Date(submission.created_at).getTime() > SUBMISSION_MAX_AGE_MS) {
    throw new HttpError(410, 'submission_expired', 'That submission has expired. Please submit your answers again.');
  }

  const env = deps.env;
  const payments = deps.payments; // validates Stripe configuration or throws a setup error
  const product = PRODUCTS.standard;
  const priceId = env.stripePriceIds.standard;
  await payments.verifyPrice(priceId, { amountMinor: product.amountMinor, currency: product.currency });

  // Pilot submissions never pay: they are fulfilled only through the owner page.
  if (submission.source === 'pilot') throw new HttpError(409, 'pilot_submission', 'Pilot submissions are not paid through checkout.');
  const { order } = await deps.db.createOrder({
    submission_id: submission.id,
    email: submission.email,
    email_normalised: submission.email_normalised,
    amount_minor: product.amountMinor,
    currency: product.currency,
    stripe_price_id: priceId,
    source: 'stripe',
    product: 'standard',
    parent_order_id: null,
  });
  if (order.source !== 'stripe') throw new HttpError(409, 'order_not_pending', 'This order is not a checkout order.');
  if (order.status !== 'pending_payment' && order.status !== 'expired') {
    throw new HttpError(409, 'order_not_pending', `This order is ${order.status}.`);
  }

  const session = await openCheckoutSession({ db: deps.db, payments, log: deps.log, now: deps.now, appUrl: env.appUrl }, order, product, priceId, '/checkout?status=cancelled');
  await deps.db.setSubmissionStatus(submission.id, 'ordered');
  return json({ checkoutUrl: session.url, orderRef: shortRef(order.id), reused: session.reused });
}
