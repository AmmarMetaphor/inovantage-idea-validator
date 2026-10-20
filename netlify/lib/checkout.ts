/*
  Opening a hosted Checkout Session for an order (standard or upgrade).

  One open session per order: if the order already has a session that is
  still open at Stripe and not past its expiry, its URL is returned again
  (a double click, a retry, or "Return to review → pay" all land on the same
  session). Otherwise a new session is created and the superseded one is
  expired at Stripe, so a stale URL can never be paid for an order that now
  points at a different session (fulfil.ts would reject such a payment, and
  the customer would need a refund).

  The browser never supplies a price or amount: the Price ID comes from
  configuration and the caller verifies it against src/config/product.ts
  (verifyPrice) before creating the order row.
*/
import type { Product } from '../../src/config/product';
import type { Db, Order } from './db/types';
import type { Logger } from './log';
import type { PaymentGateway } from './payments';

/** Stripe requires expires_at to be at least 30 minutes ahead; 60 keeps clear of clock skew. */
export const CHECKOUT_TTL_SECONDS = 60 * 60;

export interface OpenCheckoutDeps {
  db: Db;
  payments: PaymentGateway;
  log: Logger;
  now: () => Date;
  appUrl: string;
}

export async function openCheckoutSession(deps: OpenCheckoutDeps, order: Order, product: Product, priceId: string, cancelPath: string): Promise<{ url: string; reused: boolean }> {
  const now = deps.now();

  // Reuse the session the order already has when it is still payable.
  if (order.stripe_checkout_session_id && order.status === 'pending_payment' && order.checkout_expires_at && new Date(order.checkout_expires_at).getTime() > now.getTime() + 60_000) {
    const existing = await deps.payments.retrieveSession(order.stripe_checkout_session_id);
    if (existing && existing.status === 'open' && existing.paymentStatus === 'unpaid' && existing.url) {
      deps.log.info('checkout.reused', { order_id: order.id });
      return { url: existing.url, reused: true };
    }
  }

  const previous = order.stripe_checkout_session_id;
  const session = await deps.payments.createCheckoutSession({
    priceId,
    orderId: order.id,
    customerEmail: order.email,
    successUrl: `${deps.appUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${deps.appUrl}${cancelPath}`,
    expiresAtUnix: Math.floor(now.getTime() / 1000) + CHECKOUT_TTL_SECONDS,
    // A new key per attempt: Stripe returns the same session for the same key.
    idempotencyKey: `checkout:${order.id}:${previous ?? 'first'}:${Math.floor(now.getTime() / 1000)}`,
  });
  await deps.db.attachCheckoutSession(order.id, session.id, new Date(session.expiresAtUnix * 1000).toISOString());
  if (order.status === 'expired') await deps.db.setOrderStatus(order.id, 'pending_payment');
  if (previous && previous !== session.id) await deps.payments.expireSession(previous);
  deps.log.info('checkout.created', { order_id: order.id, product: product.id, superseded: previous ? true : false });
  return { url: session.url, reused: false };
}
