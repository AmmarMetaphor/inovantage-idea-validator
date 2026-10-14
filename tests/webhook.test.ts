import { describe, expect, it } from 'vitest';
import { createPendingOrder, deliverWebhook, makeHarness, post } from './helpers';
import { stripeWebhook } from './api';

describe('Stripe webhook: forged and tampered events', () => {
  it('rejects an event signed with the wrong secret and writes nothing', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId);

    const res = await deliverWebhook(h, sessionId, { secret: 'whsec_attacker' });
    expect(res.status).toBe(400);
    expect(h.db.events.size).toBe(0);
    expect(h.db.jobs.size).toBe(0);
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect(h.workerCalls).toEqual([]);
  });

  it('rejects a missing signature header', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    const { payload } = h.gateway.signedEvent(sessionId);
    const res = await stripeWebhook(post('/api/stripe-webhook', payload, {}, true), h.deps);
    expect(res.status).toBe(400);
    expect(h.db.jobs.size).toBe(0);
  });

  it('does not fulfil a genuine event whose session is still unpaid', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    // No gateway.pay(): Stripe says unpaid even though an event claims completion.
    const res = await deliverWebhook(h, sessionId);
    expect(res.status).toBe(200);
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect(h.db.jobs.size).toBe(0);
  });

  it('rejects a paid session whose amount was tampered', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId, { amountTotal: 100 });
    const res = await deliverWebhook(h, sessionId);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rejected: true });
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect(h.db.jobs.size).toBe(0);
    const ledger = [...h.db.events.values()][0];
    expect(ledger.status).toBe('rejected');
  });

  it('rejects a paid session for a different product', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId, { lineItems: [{ priceId: 'price_cheap_other', quantity: 1 }] });
    await deliverWebhook(h, sessionId);
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect(h.db.jobs.size).toBe(0);
  });

  it('rejects a paid session pointing at another customer\'s order', async () => {
    const h = makeHarness();
    const a = await createPendingOrder(h, 'alice@example.com');
    const b = await createPendingOrder(h, 'bob@example.com');
    // Bob pays, but the session metadata claims Alice's order.
    h.gateway.pay(b.sessionId, { metadataOrderId: a.order.id, clientReferenceId: a.order.id });
    await deliverWebhook(h, b.sessionId);
    expect((await h.db.getOrder(a.order.id))!.status).toBe('pending_payment');
    expect((await h.db.getOrder(b.order.id))!.status).toBe('pending_payment');
    expect(h.db.jobs.size).toBe(0);
  });

  it('fulfils a genuine paid event: order paid, durable job created, worker kicked', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    const res = await deliverWebhook(h, sessionId);
    expect(res.status).toBe(200);
    const updated = (await h.db.getOrder(order.id))!;
    expect(updated.status).toBe('paid');
    expect(updated.stripe_payment_intent_id).toMatch(/^pi_/);
    expect(updated.report_expires_at).not.toBeNull();
    expect(h.db.jobs.size).toBe(1);
    const job = [...h.db.jobs.values()][0];
    expect(job.status).toBe('queued');
    expect(h.workerCalls).toEqual([job.id]);
    expect([...h.db.events.values()][0].status).toBe('processed');
  });

  it('ignores unrelated event types', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    const res = await deliverWebhook(h, sessionId, { type: 'payment_intent.created', eventId: 'evt_other' });
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(h.db.jobs.size).toBe(0);
  });
});

describe('Stripe webhook: duplicate and concurrent events', () => {
  it('a redelivered event is acknowledged without a second job', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    await deliverWebhook(h, sessionId, { eventId: 'evt_1' });
    const second = await deliverWebhook(h, sessionId, { eventId: 'evt_1' });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(h.db.jobs.size).toBe(1);
    expect(h.workerCalls.length).toBe(1);
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
  });

  it('two different events for the same paid session still produce one job', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    await deliverWebhook(h, sessionId, { eventId: 'evt_completed', type: 'checkout.session.completed' });
    await deliverWebhook(h, sessionId, { eventId: 'evt_async', type: 'checkout.session.async_payment_succeeded' });
    expect(h.db.jobs.size).toBe(1);
    expect(h.workerCalls.length).toBe(1);
  });

  it('concurrent deliveries of the same event create exactly one job', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    const results = await Promise.all([1, 2, 3, 4].map(() => deliverWebhook(h, sessionId, { eventId: 'evt_dup' })));
    const statuses = results.map((r) => r.status).sort();
    // One processes (200); the others are either acknowledged duplicates (200) or asked to retry (409).
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    expect(h.db.jobs.size).toBe(1);
    expect(h.workerCalls.length).toBe(1);
    expect(h.db.events.size).toBe(1);
  });

  it('a failed processing attempt is retried on redelivery, not treated as a duplicate', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId);
    // First delivery: the session lookup fails transiently.
    const original = h.gateway.retrieveSession.bind(h.gateway);
    h.gateway.retrieveSession = async () => { throw new Error('stripe timeout'); };
    const first = await deliverWebhook(h, sessionId, { eventId: 'evt_retry' });
    expect(first.status).toBe(500);
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    h.gateway.retrieveSession = original;
    const second = await deliverWebhook(h, sessionId, { eventId: 'evt_retry' });
    expect(second.status).toBe(200);
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
    expect(h.db.jobs.size).toBe(1);
  });
});
