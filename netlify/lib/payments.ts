/*
  Payment gateway abstraction over Stripe Checkout.

  The server owns the price: the client never sends an amount. The Price ID
  comes from configuration, and every paid session is re-verified against the
  expected price, amount and currency before fulfilment.
*/
import Stripe from 'stripe';

export interface VerifiedSession {
  id: string;
  /** Hosted checkout URL while the session is open. */
  url: string | null;
  mode: string | null;
  paymentStatus: string;
  status: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  clientReferenceId: string | null;
  metadataOrderId: string | null;
  lineItems: { priceId: string | null; quantity: number | null }[];
  customerEmail: string | null;
  /** Unix seconds */
  created: number;
}

export interface WebhookEventLite {
  id: string;
  type: string;
  /** Checkout session id if the event carries one. */
  sessionId: string | null;
  rawPayloadHash: string;
}

export interface PaymentGateway {
  /** Confirms the configured Price exists and matches the expected amount. */
  verifyPrice(priceId: string, expected: { amountMinor: number; currency: string }): Promise<void>;
  createCheckoutSession(input: {
    priceId: string;
    orderId: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    expiresAtUnix: number;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string; expiresAtUnix: number }>;
  retrieveSession(sessionId: string): Promise<VerifiedSession | null>;
  /** Expire an open session so a stale checkout URL can no longer be paid. Best effort; never throws. */
  expireSession(sessionId: string): Promise<void>;
  /** Throws on an invalid signature. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookEventLite>;
}

/** The path Stripe must POST to on the deployed site (netlify.toml maps /api/* to the functions). */
export const STRIPE_WEBHOOK_PATH = '/api/stripe-webhook';

/** Events the webhook handler acts on; everything else is acknowledged and ignored. */
export const STRIPE_WEBHOOK_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'] as const;

/** The API version the installed SDK pins; set the webhook endpoint to the same version in the dashboard. */
export function stripeApiVersion(): string {
  return String((new Stripe('sk_test_placeholder') as unknown as { getApiField(k: string): unknown }).getApiField('version'));
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class StripeGateway implements PaymentGateway {
  private stripe: Stripe;
  constructor(secretKey: string, private webhookSecret: string, private hash: (s: string) => string, client?: Stripe) {
    // No apiVersion override: the SDK pins the API version it was built for.
    this.stripe = client ?? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 8000 });
  }


  async verifyPrice(priceId: string, expected: { amountMinor: number; currency: string }) {
    const price = await this.stripe.prices.retrieve(priceId);
    if (!price.active) throw new Error(`Stripe price ${priceId} is not active.`);
    if (price.type !== 'one_time') throw new Error(`Stripe price ${priceId} must be a one-time price.`);
    if (price.unit_amount !== expected.amountMinor || price.currency.toLowerCase() !== expected.currency.toLowerCase()) {
      throw new Error(
        `Stripe price ${priceId} is ${price.unit_amount} ${price.currency.toUpperCase()}, but the product is configured as ${expected.amountMinor} ${expected.currency}. Fix STRIPE_PRICE_ID or src/config/product.ts.`,
      );
    }
  }

  async createCheckoutSession(input: Parameters<PaymentGateway['createCheckoutSession']>[0]) {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Card only for now: no delayed-notification methods, so payment_status
        // is 'paid' on checkout.session.completed and the async_* events do
        // not occur. Widen deliberately later; the webhook already handles them.
        payment_method_types: ['card'],
        line_items: [{ price: input.priceId, quantity: 1 }],
        customer_email: input.customerEmail,
        client_reference_id: input.orderId,
        metadata: { order_id: input.orderId },
        payment_intent_data: { metadata: { order_id: input.orderId } },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: input.expiresAtUnix,
        allow_promotion_codes: false,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return { id: session.id, url: session.url, expiresAtUnix: session.expires_at };
  }

  async retrieveSession(sessionId: string) {
    let s: Stripe.Checkout.Session;
    try {
      s = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.statusCode === 404) return null;
      throw err;
    }
    return toVerified(s);
  }

  async expireSession(sessionId: string) {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch {
      // Already expired, completed or unknown: nothing to do. The server-side
      // session check in fulfil.ts refuses any session not attached to the order.
    }
  }

  async verifyWebhook(rawBody: string, signatureHeader: string | null) {
    if (!signatureHeader) throw new WebhookSignatureError('Missing stripe-signature header.');
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(rawBody, signatureHeader, this.webhookSecret);
    } catch (err) {
      throw new WebhookSignatureError(err instanceof Error ? err.message : 'Invalid signature.');
    }
    const obj = event.data.object as { object?: string; id?: string };
    return {
      id: event.id,
      type: event.type,
      sessionId: obj.object === 'checkout.session' && obj.id ? obj.id : null,
      rawPayloadHash: this.hash(rawBody),
    };
  }
}

export function toVerified(s: Stripe.Checkout.Session): VerifiedSession {
  const pi = s.payment_intent;
  return {
    id: s.id,
    url: s.url,
    mode: s.mode,
    paymentStatus: s.payment_status,
    status: s.status,
    amountTotal: s.amount_total,
    currency: s.currency,
    paymentIntentId: typeof pi === 'string' ? pi : (pi?.id ?? null),
    clientReferenceId: s.client_reference_id,
    metadataOrderId: s.metadata?.order_id ?? null,
    lineItems: (s.line_items?.data ?? []).map((li) => ({
      priceId: typeof li.price === 'string' ? li.price : (li.price?.id ?? null),
      quantity: li.quantity,
    })),
    customerEmail: s.customer_details?.email ?? s.customer_email ?? null,
    created: s.created,
  };
}
