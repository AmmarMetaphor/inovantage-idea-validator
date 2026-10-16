import { describe, expect, it } from 'vitest';
import { hashToken } from '../netlify/lib/crypto';
import { checkoutResult, recoverReport, reportDownload, reportStatus } from './api';
import { createPendingOrder, deliverWebhook, get, makeHarness, post } from './helpers';

async function paidOrder(h: ReturnType<typeof makeHarness>, email = 'founder@example.com') {
  const { sessionId, order } = await createPendingOrder(h, email);
  h.gateway.pay(sessionId);
  await deliverWebhook(h, sessionId, { eventId: `evt_${sessionId}` });
  return { sessionId, order: (await h.db.getOrder(order.id))! };
}

async function tokenVia(h: ReturnType<typeof makeHarness>, sessionId: string) {
  const res = await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps);
  const body = (await res.json()) as { state: string; reportPath: string | null };
  return body.reportPath!.replace('/report/', '');
}

describe('Report access: unpaid, unknown, expired and cross-customer', () => {
  it('a random token reveals nothing', async () => {
    const h = makeHarness();
    await paidOrder(h);
    const res = await reportStatus(post('/api/report-status', { token: 'A'.repeat(43) }), h.deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/founder|Northside/);
  });

  it('a malformed token is treated exactly like an unknown one', async () => {
    const h = makeHarness();
    const r1 = await reportStatus(post('/api/report-status', { token: 'short' }), h.deps);
    const r2 = await reportStatus(post('/api/report-status', {}), h.deps);
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
  });

  it('an unpaid order has no access even if a token is somehow issued for it', async () => {
    const h = makeHarness();
    const { order } = await createPendingOrder(h);
    const token = 'B'.repeat(43);
    await h.db.createAccessToken({ order_id: order.id, token_hash: hashToken(token), issued_via: 'email', expires_at: null });
    const res = await reportStatus(post('/api/report-status', { token }), h.deps);
    expect(res.status).toBe(404);
    const dl = await reportDownload(post('/api/report-download', { token }), h.deps);
    expect(dl.status).toBe(404);
  });

  it('the checkout return page never fulfils an unpaid session', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    const res = await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps);
    expect(await res.json()).toEqual({ state: 'pending', product: 'standard' });
    expect((await h.db.getOrder(order.id))!.status).toBe('pending_payment');
    expect(h.db.jobs.size).toBe(0);
  });

  it('the checkout return page fulfils only after Stripe confirms payment server-side', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    h.gateway.pay(sessionId); // webhook has not arrived yet
    const res = await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps);
    const body = (await res.json()) as { state: string; reportPath: string };
    expect(body.state).toBe('paid');
    expect(body.reportPath).toMatch(/^\/report\/[A-Za-z0-9_-]{43}$/);
    expect((await h.db.getOrder(order.id))!.status).toBe('paid');
    expect(h.db.jobs.size).toBe(1);
    // A later webhook for the same session is a no-op.
    await deliverWebhook(h, sessionId);
    expect(h.db.jobs.size).toBe(1);
  });

  it('rejects guessed or malformed session ids', async () => {
    const h = makeHarness();
    expect((await checkoutResult(get('/api/checkout-result?session_id=cs_test_doesnotexist123'), h.deps)).status).toBe(404);
    expect((await checkoutResult(get('/api/checkout-result?session_id=../../etc'), h.deps)).status).toBe(400);
  });

  it('a valid token returns a minimal status and nothing about other customers', async () => {
    const h = makeHarness();
    const alice = await paidOrder(h, 'alice@example.com');
    const bob = await paidOrder(h, 'bob@example.com');
    const aliceToken = await tokenVia(h, alice.sessionId);
    const res = await reportStatus(post('/api/report-status', { token: aliceToken }), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['detailed', 'emailMasked', 'expiresAt', 'ideaName', 'isPilot', 'orderedAt', 'reportRef', 'standard', 'upgrade']);
    expect(body.emailMasked).toBe('al***@example.com');
    expect((body.standard as { stage: string }).stage).toBe('payment_confirmed');
    expect(body.expiresAt).toBeNull(); // ongoing access: no preset expiry
    const text = JSON.stringify(body);
    expect(text).not.toContain('bob');
    expect(text).not.toContain(bob.order.id);
    expect(text).not.toContain(alice.order.id); // only the short ref is exposed
  });

  it('a checkout-return token expires after its TTL, but an email-delivered token does not', async () => {
    const h = makeHarness();
    const { sessionId, order } = await paidOrder(h);
    const token = await tokenVia(h, sessionId);
    const emailToken = 'E'.repeat(43);
    await h.db.createAccessToken({ order_id: order.id, token_hash: hashToken(emailToken), issued_via: 'email', expires_at: null });
    h.clock.advance(400 * 86_400_000);
    expect((await reportStatus(post('/api/report-status', { token }), h.deps)).status).toBe(404);
    expect((await reportStatus(post('/api/report-status', { token: emailToken }), h.deps)).status).toBe(200);
  });

  it('revocation stops every token for the order', async () => {
    const h = makeHarness();
    const { sessionId, order } = await paidOrder(h);
    const token = await tokenVia(h, sessionId);
    expect((await reportStatus(post('/api/report-status', { token }), h.deps)).status).toBe(200);
    expect(await h.db.revokeTokensForOrder(order.id, h.clock.now.toISOString())).toBeGreaterThan(0);
    expect((await reportStatus(post('/api/report-status', { token }), h.deps)).status).toBe(404);
  });

  it('report access expires with the order even if a token is fresh', async () => {
    const h = makeHarness();
    const { sessionId, order } = await paidOrder(h);
    const token = await tokenVia(h, sessionId);
    const o = h.db.orders.get(order.id)!;
    o.report_expires_at = new Date(h.clock.now.getTime() - 1000).toISOString();
    const res = await reportStatus(post('/api/report-status', { token }), h.deps);
    expect(((await res.json()) as { standard: { stage: string } }).standard.stage).toBe('expired');
    const dl = await reportDownload(post('/api/report-download', { token }), h.deps);
    expect(dl.status).toBe(410);
  });

  it('download is refused until a PDF exists, then yields a fresh storage URL on every request', async () => {
    const h = makeHarness();
    const { sessionId, order } = await paidOrder(h);
    const token = await tokenVia(h, sessionId);
    expect((await reportDownload(post('/api/report-download', { token }), h.deps)).status).toBe(409);
    await h.blobs.putPdf(`orders/${order.id}/standard-v1.pdf`, Buffer.from('%PDF'));
    await h.db.upsertReport(order.id, { status: 'rendered', pdf_object_path: `orders/${order.id}/standard-v1.pdf` });
    const first = await reportDownload(post('/api/report-download', { token }), h.deps);
    expect(first.status).toBe(200);
    const body = (await first.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('expiresInSeconds'); // no customer-facing deadline
    // Days later, after any storage URL would have expired, the same stable link still works.
    h.clock.advance(10 * 86_400_000);
    const again = await reportDownload(post('/api/report-download', { token }), h.deps);
    expect(again.status).toBe(200);
  });

  it('the return-page token window closes two hours after payment', async () => {
    const h = makeHarness();
    const { sessionId } = await paidOrder(h);
    h.clock.advance(3 * 3_600_000);
    const res = await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps);
    expect(await res.json()).toMatchObject({ state: 'paid', reportPath: null });
  });
});

describe('Link recovery', () => {
  it('returns the same generic answer for unknown and known emails', async () => {
    const h = makeHarness();
    await paidOrder(h, 'alice@example.com');
    const unknown = await recoverReport(post('/api/recover-report', { email: 'nobody@example.com' }), h.deps);
    const known = await recoverReport(post('/api/recover-report', { email: 'alice@example.com' }), h.deps);
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
    expect(h.mailer.sent.length).toBe(1);
  });

  it('sends only to the original order email, never to a lookalike or another customer', async () => {
    const h = makeHarness();
    await paidOrder(h, 'alice@example.com');
    await paidOrder(h, 'bob@example.com');
    await recoverReport(post('/api/recover-report', { email: 'ALICE@example.com' }), h.deps);
    expect(h.mailer.sent.length).toBe(1);
    expect(h.mailer.sent[0].to).toBe('alice@example.com');
    expect(h.mailer.sent[0].text).not.toContain('bob');
    expect(h.mailer.sent[0].text).toMatch(/https:\/\/app\.test\/report\/[A-Za-z0-9_-]{43}/);
    // Bob's order never appears in Alice's email and Alice's token cannot open Bob's order.
    const token = /\/report\/([A-Za-z0-9_-]{43})/.exec(h.mailer.sent[0].text)![1];
    const status = (await (await reportStatus(post('/api/report-status', { token }), h.deps)).json()) as { emailMasked: string };
    expect(status.emailMasked).toBe('al***@example.com');
    // Recovery tokens no longer carry a preset order expiry.
    expect(h.mailer.sent[0].text).not.toMatch(/until \d{4}/);
  });

  it('does not email for unpaid orders', async () => {
    const h = makeHarness();
    await createPendingOrder(h, 'carol@example.com');
    await recoverReport(post('/api/recover-report', { email: 'carol@example.com' }), h.deps);
    expect(h.mailer.sent.length).toBe(0);
  });

  it('is rate limited per email without revealing it', async () => {
    const h = makeHarness();
    await paidOrder(h, 'alice@example.com');
    for (let i = 0; i < 4; i += 1) {
      const res = await recoverReport(post('/api/recover-report', { email: 'alice@example.com' }), h.deps);
      expect(res.status).toBe(200);
    }
    expect(h.mailer.sent.length).toBe(3);
  });
});
