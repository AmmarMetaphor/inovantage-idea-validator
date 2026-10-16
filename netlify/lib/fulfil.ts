/*
  Fulfilment of a paid Checkout Session.

  Called from the Stripe webhook (primary) and from the checkout-return
  endpoint (secondary, only after a server-side retrieval of the session from
  Stripe). Both paths run the same verification and are idempotent, so a
  duplicate or concurrent call cannot double-fulfil.

  Verification before anything is written:
    1. the session is in payment mode and payment_status is "paid"
    2. the session belongs to an order we created (metadata + client_reference_id)
       and is the session we attached to that order
    3. the amount and currency equal the order's
    4. the line items are exactly one unit of the configured Price
  Then, atomically where the database allows:
    5. mark the order paid (conditional update; unique payment intent)
    6. create the durable job (unique per order) BEFORE returning
*/
import { FULFILLABLE, type Db, type Job, type Order } from './db/types';
import type { Logger } from './log';
import type { VerifiedSession } from './payments';

export interface FulfilDeps {
  db: Db;
  log: Logger;
  now: () => Date;
  /** Stripe Price IDs per product; the session must contain exactly the order's product. */
  expectedPriceIds: { standard: string; upgrade: string };
  reportAccessDays: number;
  /** Fire-and-forget worker kick; failures are logged, the dispatcher covers them. */
  invokeWorker: (jobId: string) => Promise<void>;
}

export type FulfilResult =
  | { outcome: 'fulfilled'; order: Order; job: Job; firstTime: boolean }
  | { outcome: 'not_paid'; order: Order | null }
  | { outcome: 'rejected'; reason: string; orderId: string | null };

export async function fulfilCheckoutSession(deps: FulfilDeps, session: VerifiedSession, source: 'stripe_webhook' | 'checkout_return'): Promise<FulfilResult> {
  const { db, log } = deps;
  const orderId = session.metadataOrderId;

  if (!orderId || session.clientReferenceId !== orderId) {
    return { outcome: 'rejected', reason: 'session is not associated with an order', orderId: null };
  }
  const order = await db.getOrder(orderId);
  if (!order) return { outcome: 'rejected', reason: 'order not found', orderId };
  if (order.source !== 'stripe') return { outcome: 'rejected', reason: 'order is not a Stripe order', orderId };
  if (order.stripe_checkout_session_id !== session.id) {
    return { outcome: 'rejected', reason: 'session does not match the order', orderId };
  }
  if (session.mode !== 'payment') return { outcome: 'rejected', reason: 'session is not a payment', orderId };
  if (session.paymentStatus !== 'paid') return { outcome: 'not_paid', order };
  if (session.amountTotal !== order.amount_minor || (session.currency ?? '').toLowerCase() !== order.currency.toLowerCase()) {
    return { outcome: 'rejected', reason: 'amount or currency mismatch', orderId };
  }
  const expectedPrice = deps.expectedPriceIds[order.product];
  if (!expectedPrice || session.lineItems.length !== 1 || session.lineItems[0].priceId !== expectedPrice || session.lineItems[0].quantity !== 1) {
    return { outcome: 'rejected', reason: 'unexpected product in session', orderId };
  }
  if (order.product === 'upgrade') {
    if (!order.parent_order_id) return { outcome: 'rejected', reason: 'upgrade order has no standard order', orderId };
    const parent = await db.getOrder(order.parent_order_id);
    if (!parent || parent.submission_id !== order.submission_id || !FULFILLABLE.includes(parent.status)) {
      return { outcome: 'rejected', reason: 'standard order is not paid', orderId };
    }
  }
  if (!session.paymentIntentId) return { outcome: 'rejected', reason: 'no payment intent', orderId };
  if (order.status === 'refunded' || order.status === 'failed') {
    return { outcome: 'rejected', reason: `order is ${order.status}`, orderId };
  }

  const now = deps.now();
  // Ongoing access by default (reportAccessDays = 0 → no preset expiry).
  const reportExpiresAt = deps.reportAccessDays > 0 ? new Date(now.getTime() + deps.reportAccessDays * 86_400_000).toISOString() : null;
  const paid = await db.markOrderPaid({ orderId, paymentIntentId: session.paymentIntentId, authorisedBy: source, paidAt: now.toISOString(), reportExpiresAt });
  if (!paid.applied && paid.order.stripe_payment_intent_id && paid.order.stripe_payment_intent_id !== session.paymentIntentId) {
    log.error('fulfil.payment_intent_conflict', { order_id: orderId, source });
    return { outcome: 'rejected', reason: 'order already paid by a different payment', orderId };
  }
  if (paid.applied) await db.setSubmissionStatus(order.submission_id, 'paid');

  // Durable job record exists before the caller acknowledges the event.
  const { created, job } = await db.createJob({ order_id: orderId, type: 'report' });
  log.info('fulfil.ok', { order_id: orderId, job_id: job.id, source, first_time: paid.applied, job_created: created });

  if (created) {
    try {
      await deps.invokeWorker(job.id);
    } catch (err) {
      log.warn('fulfil.worker_invoke_failed', { job_id: job.id, err });
    }
  }
  return { outcome: 'fulfilled', order: paid.order, job, firstTime: paid.applied };
}
