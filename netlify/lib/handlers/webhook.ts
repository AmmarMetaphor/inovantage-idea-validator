import type { Deps } from '../deps';
import { fulfilCheckoutSession } from '../fulfil';
import { HttpError, json, requireMethod } from '../http';
import { WebhookSignatureError } from '../payments';

const HANDLED = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const TERMINAL = new Set(['checkout.session.expired', 'checkout.session.async_payment_failed']);
const MAX_WEBHOOK_BYTES = 512 * 1024;
const IN_PROGRESS_GRACE_MS = 2 * 60 * 1000;

/**
 * POST /api/stripe-webhook
 * Verifies the signature on the raw body, records the event in the ledger
 * (unique per event id), fulfils, and only then acknowledges with 200.
 */
export async function stripeWebhook(req: Request, deps: Deps): Promise<Response> {
  requireMethod(req, 'POST');
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_WEBHOOK_BYTES) throw new HttpError(413, 'payload_too_large');
  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BYTES) throw new HttpError(413, 'payload_too_large');

  let event;
  try {
    event = await deps.payments.verifyWebhook(raw, req.headers.get('stripe-signature'));
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      deps.log.warn('webhook.bad_signature');
      throw new HttpError(400, 'invalid_signature', 'Webhook signature verification failed.');
    }
    throw err;
  }

  const { db, log } = deps;
  const { created, event: ledger } = await db.insertWebhookEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, payload_hash: event.rawPayloadHash });

  if (!created) {
    if (ledger.status === 'processed' || ledger.status === 'ignored' || ledger.status === 'rejected') {
      log.info('webhook.duplicate', { event_type: event.type, status: ledger.status });
      return json({ received: true, duplicate: true });
    }
    const age = deps.now().getTime() - new Date(ledger.received_at).getTime();
    if (ledger.status === 'processing' && age < IN_PROGRESS_GRACE_MS) {
      // Another delivery of this event is mid-flight. Ask Stripe to retry later.
      return json({ received: false, inProgress: true }, 409);
    }
    // 'received' or 'failed' (or a stale 'processing'): reprocess idempotently.
  }

  if (!HANDLED.has(event.type) && !TERMINAL.has(event.type)) {
    await db.updateWebhookEvent(ledger.id, { status: 'ignored', processed_at: deps.now().toISOString() });
    return json({ received: true, ignored: true });
  }

  await db.updateWebhookEvent(ledger.id, { status: 'processing' });
  try {
    if (!event.sessionId) throw new Error('event has no checkout session');

    if (TERMINAL.has(event.type)) {
      const order = await db.getOrderByCheckoutSession(event.sessionId);
      if (order && order.status === 'pending_payment') await db.setOrderStatus(order.id, 'expired');
      await db.updateWebhookEvent(ledger.id, { status: 'processed', order_id: order?.id ?? null, processed_at: deps.now().toISOString() });
      return json({ received: true });
    }

    // Always re-read the session from Stripe: the verified payload proves the
    // event is genuine; the retrieval supplies line items for product checks.
    const session = await deps.payments.retrieveSession(event.sessionId);
    if (!session) throw new Error('checkout session not found at Stripe');

    const result = await fulfilCheckoutSession(
      { db, log, now: deps.now, expectedPriceIds: deps.env.stripePriceIds, reportAccessDays: deps.env.reportAccessDays, invokeWorker: deps.invokeWorker },
      session,
      'stripe_webhook',
    );

    if (result.outcome === 'rejected') {
      // Genuine event, but it does not match an order we would fulfil. Do not
      // retry; record for investigation.
      log.error('webhook.rejected', { reason: result.reason, order_id: result.orderId });
      await db.updateWebhookEvent(ledger.id, { status: 'rejected', error: result.reason, order_id: result.orderId, processed_at: deps.now().toISOString() });
      return json({ received: true, rejected: true });
    }
    if (result.outcome === 'not_paid') {
      await db.updateWebhookEvent(ledger.id, { status: 'ignored', error: 'session not paid', order_id: result.order?.id ?? null, processed_at: deps.now().toISOString() });
      return json({ received: true, ignored: true });
    }
    await db.updateWebhookEvent(ledger.id, { status: 'processed', order_id: result.order.id, processed_at: deps.now().toISOString() });
    return json({ received: true, jobId: result.job.id });
  } catch (err) {
    log.error('webhook.failed', { err });
    await db.updateWebhookEvent(ledger.id, { status: 'failed', error: err instanceof Error ? err.message.slice(0, 500) : String(err) });
    // Non-2xx makes Stripe retry with backoff.
    return json({ received: false, error: 'processing_failed' }, 500);
  }
}
