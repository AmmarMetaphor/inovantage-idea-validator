/*
  Stripe integration contract. Everything here runs against in-memory
  persistence and a fake Stripe (the real signature algorithm, fake API):
  no live payment is made.
*/
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../src/config/product';
import { CHECKOUT_TTL_SECONDS } from '../netlify/lib/checkout';
import { STRIPE_WEBHOOK_EVENTS, STRIPE_WEBHOOK_PATH, StripeGateway, stripeApiVersion } from '../netlify/lib/payments';
import { checkoutResult, createCheckout, createSubmission, createUpgradeCheckout, reportStatus } from './api';
import { createPendingOrder, deliverWebhook, get, makeHarness, post, validAnswers } from './helpers';

describe('Hosted Checkout Session parameters (fake Stripe client)', () => {
  it('creates a card-only payment-mode session bound to the order, with an idempotency key', async () => {
    const calls: { params: Record<string, unknown>; options: Record<string, unknown> }[] = [];
    const fakeStripe = {
      checkout: { sessions: { create: async (params: Record<string, unknown>, options: Record<string, unknown>) => { calls.push({ params, options }); return { id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc', expires_at: Number(params.expires_at) }; } } },
    } as unknown as Stripe;
    const gw = new StripeGateway('sk_test_placeholder', 'whsec_placeholder', (s) => s, fakeStripe);
    const r = await gw.createCheckoutSession({ priceId: 'price_std', orderId: 'order-1', customerEmail: 'a@b.co', successUrl: 'https://app/checkout/return?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'https://app/checkout?status=cancelled', expiresAtUnix: 1_900_000_000, idempotencyKey: 'checkout:order-1:first:1' });
    expect(r).toEqual({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc', expiresAtUnix: 1_900_000_000 });
    const { params, options } = calls[0];
    expect(params.mode).toBe('payment');
    expect(params.payment_method_types).toEqual(['card']);
    expect(params.line_items).toEqual([{ price: 'price_std', quantity: 1 }]);
    expect(params.client_reference_id).toBe('order-1');
    expect(params.metadata).toEqual({ order_id: 'order-1' });
    expect(params.payment_intent_data).toEqual({ metadata: { order_id: 'order-1' } });
    expect(params.customer_email).toBe('a@b.co');
    expect(params.allow_promotion_codes).toBe(false);
    expect(String(params.success_url)).toContain('{CHECKOUT_SESSION_ID}');
    expect(options.idempotencyKey).toBe('checkout:order-1:first:1');
    // No amount, currency or price comes from the caller beyond the configured Price ID.
    expect(params).not.toHaveProperty('amount');
    expect(params).not.toHaveProperty('unit_amount');
  });

  it('publishes the webhook path, events and the SDK-pinned API version for dashboard setup', () => {
    expect(STRIPE_WEBHOOK_PATH).toBe('/api/stripe-webhook');
    expect([...STRIPE_WEBHOOK_EVENTS]).toEqual(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);
    expect(stripeApiVersion()).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(CHECKOUT_TTL_SECONDS).toBeGreaterThanOrEqual(30 * 60);
  });

  it('expiring a session is best effort and never throws', async () => {
    const fakeStripe = { checkout: { sessions: { expire: async () => { throw new Error('already complete'); } } } } as unknown as Stripe;
    const gw = new StripeGateway('sk_test_placeholder', 'whsec_placeholder', (s) => s, fakeStripe);
    await expect(gw.expireSession('cs_test_x')).resolves.toBeUndefined();
  });
});

describe('One open session per order', () => {
  it('a second checkout request for the same submission reuses the open session', async () => {
    const h = makeHarness();
    const { submissionId, sessionId } = await createPendingOrder(h);
    const again = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    const body = (await again.json()) as { checkoutUrl: string; reused: boolean };
    expect(body.reused).toBe(true);
    expect(body.checkoutUrl.endsWith(sessionId)).toBe(true);
    expect(h.gateway.created).toHaveLength(1);
    expect(h.db.orders.size).toBe(1);
  });

  it('after the session expires a new one is created, the old one is expired at Stripe, and a payment on the old one is rejected', async () => {
    const h = makeHarness();
    const { submissionId, sessionId: oldId } = await createPendingOrder(h);
    h.clock.advance((CHECKOUT_TTL_SECONDS + 60) * 1000);
    await h.db.expireStaleCheckouts(h.deps.now().toISOString());
    const again = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    const body = (await again.json()) as { checkoutUrl: string; reused: boolean };
    expect(body.reused).toBe(false);
    const newId = body.checkoutUrl.split('/').pop()!;
    expect(newId).not.toBe(oldId);
    expect(h.gateway.expired).toEqual([oldId]);
    const order = [...h.db.orders.values()][0];
    expect(order.status).toBe('pending_payment');
    expect(order.stripe_checkout_session_id).toBe(newId);
    // Someone pays through the stale session anyway: genuine event, but not the order's session.
    h.gateway.pay(oldId);
    const res = await deliverWebhook(h, oldId, { eventId: 'evt_old' });
    expect(res.status).toBe(200);
    expect(h.db.jobs.size).toBe(0);
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect([...h.db.events.values()][0]).toMatchObject({ status: 'rejected', error: 'session does not match the order' });
    // The current session still works.
    h.gateway.pay(newId);
    await deliverWebhook(h, newId, { eventId: 'evt_new' });
    expect(h.db.jobs.size).toBe(1);
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
  });

  it('a paid submission cannot start another checkout', async () => {
    const h = makeHarness();
    const { submissionId, sessionId } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    await deliverWebhook(h, sessionId);
    const res = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    expect(res.status).toBe(409);
  });
});

describe('Delayed and terminal events', () => {
  it('a completed event with payment_status unpaid is ignored; the later async_payment_succeeded fulfils once', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    // Checkout completed but the (hypothetical delayed) payment is not yet confirmed.
    const s = h.gateway.sessions.get(sessionId)!;
    s.status = 'complete';
    const first = await deliverWebhook(h, sessionId, { eventId: 'evt_completed', type: 'checkout.session.completed' });
    expect(await first.json()).toMatchObject({ received: true, ignored: true });
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect(h.db.jobs.size).toBe(0);
    h.gateway.pay(sessionId);
    const second = await deliverWebhook(h, sessionId, { eventId: 'evt_async_ok', type: 'checkout.session.async_payment_succeeded' });
    expect(await second.json()).toMatchObject({ received: true });
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
    expect(h.db.jobs.size).toBe(1);
    // Redelivery of either event changes nothing.
    await deliverWebhook(h, sessionId, { eventId: 'evt_async_ok', type: 'checkout.session.async_payment_succeeded' });
    await deliverWebhook(h, sessionId, { eventId: 'evt_completed2', type: 'checkout.session.completed' });
    expect(h.db.jobs.size).toBe(1);
  });

  it('async_payment_failed marks a pending order expired so checkout can be retried, and never touches a paid order', async () => {
    const h = makeHarness();
    const { sessionId, order, submissionId } = await createPendingOrder(h);
    await deliverWebhook(h, sessionId, { eventId: 'evt_fail', type: 'checkout.session.async_payment_failed' });
    expect((await h.db.getOrder(order.id))!.status).toBe('expired');
    expect(h.db.jobs.size).toBe(0);
    // The customer can try again from the review page.
    const again = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    expect(again.status).toBe(200);
    const newId = ((await again.json()) as { checkoutUrl: string }).checkoutUrl.split('/').pop()!;
    h.gateway.pay(newId);
    await deliverWebhook(h, newId, { eventId: 'evt_paid' });
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
    // Late expiry/failure events for the paid order are harmless.
    await deliverWebhook(h, newId, { eventId: 'evt_late_expired', type: 'checkout.session.expired' });
    await deliverWebhook(h, newId, { eventId: 'evt_late_failed', type: 'checkout.session.async_payment_failed' });
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
    expect(h.db.jobs.size).toBe(1);
  });
});

describe('Return page contract and browser-closed payments', () => {
  it('the return endpoint never trusts the URL: an unpaid session stays pending, a tampered id is rejected', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    expect(await (await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps)).json()).toMatchObject({ state: 'pending' });
    expect((await checkoutResult(get('/api/checkout-result?session_id=cs_test_doesnotexist000'), h.deps)).status).toBe(404);
    expect((await checkoutResult(get('/api/checkout-result?session_id=paid'), h.deps)).status).toBe(400);
    expect(h.db.jobs.size).toBe(0);
  });

  it('a payment the webhook has already fulfilled is reported paid on return with a private link, and no second job', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    await deliverWebhook(h, sessionId);
    const r = (await (await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps)).json()) as { state: string; reportPath: string };
    expect(r.state).toBe('paid');
    expect(r.reportPath).toMatch(/^\/report\//);
    expect(h.db.jobs.size).toBe(1);
    const status = await reportStatus(post('/api/report-status', { token: r.reportPath.split('/').pop() }), h.deps);
    expect(status.status).toBe(200);
  });

  it('if the browser never returns, the webhook alone fulfils and the confirmation email goes out once', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    const res = await deliverWebhook(h, sessionId);
    expect(res.status).toBe(200);
    expect(h.workerCalls).toHaveLength(1);
    expect(h.db.jobs.size).toBe(1);
  });

  it('upgrade checkout requires the report token, a paid standard order, and is created once', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    const unpaid = await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token: 'x'.repeat(43) }), h.deps);
    expect([401, 403, 404]).toContain(unpaid.status);
    h.gateway.pay(sessionId);
    await deliverWebhook(h, sessionId);
    const r = (await (await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps)).json()) as { reportPath: string };
    const token = r.reportPath.split('/').pop()!;
    const a = await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps);
    expect(a.status).toBe(200);
    const b = await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps);
    expect((await b.json()) as { reused: boolean }).toMatchObject({ reused: true });
    const upgradeOrders = [...h.db.orders.values()].filter((o) => o.product === 'upgrade');
    expect(upgradeOrders).toHaveLength(1);
    expect(upgradeOrders[0].amount_minor).toBe(PRODUCTS.upgrade.amountMinor);
    expect(h.gateway.created.filter((c) => c.priceId === upgradeOrders[0].stripe_price_id)).toHaveLength(1);
  });

  it('pilot submissions are refused by the public checkout', async () => {
    const h = makeHarness();
    const sub = await createSubmission(post('/api/create-submission', { answers: validAnswers('p@example.com'), website: '' }), h.deps);
    const { submissionId } = (await sub.json()) as { submissionId: string };
    const s = h.db.submissions.get(submissionId)!;
    s.source = 'pilot';
    const res = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    expect(res.status).toBe(409);
    expect(h.gateway.created).toHaveLength(0);
  });
});
