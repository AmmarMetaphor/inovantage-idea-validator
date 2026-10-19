import { describe, expect, it } from 'vitest';
import { PRODUCTS, COMBINED_TOTAL } from '../src/config/product';
import { runJob } from '../netlify/lib/jobs';
import { checkoutResult, createUpgradeCheckout, reportContent, reportDownload, reportStatus } from './api';
import { createPendingOrder, deliverWebhook, get, makeHarness, post, PRICE_ID_UPGRADE, type Harness } from './helpers';

async function paidStandard(h: Harness, email = 'founder@example.com') {
  const { sessionId, order } = await createPendingOrder(h, email);
  h.gateway.pay(sessionId);
  await deliverWebhook(h, sessionId, { eventId: `evt_${sessionId}` });
  const res = await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps);
  const { reportPath } = (await res.json()) as { reportPath: string };
  return { order: (await h.db.getOrder(order.id))!, token: reportPath.replace('/report/', '') };
}

function jobDeps(h: Harness) {
  return {
    db: h.db, blobs: h.blobs, mailer: h.mailer, generator: h.generator, log: h.deps.log, now: h.deps.now,
    appUrl: 'https://app.test', tokenTtlDays: 30, heartbeatMs: 60_000, pilotAllowedEmails: ['support@metaphorconsultants.com'],
    renderStandard: async () => ({ pdf: Buffer.from('%PDF-std'), pageCount: 2 }),
    renderDetailed: async () => ({ pdf: Buffer.from('%PDF-det'), pageCount: 7 }),
  };
}

describe('Product definition', () => {
  it('prices are centralised: £17 standard, £34 additional upgrade, £51 combined', () => {
    expect(PRODUCTS.standard.amountMinor).toBe(1700);
    expect(PRODUCTS.upgrade.amountMinor).toBe(3400);
    expect(COMBINED_TOTAL.amountMinor).toBe(5100);
    expect(PRODUCTS.upgrade.priceNote).toMatch(/additional/);
    expect(PRODUCTS.standard.stripePriceEnv).toBe('STRIPE_PRICE_ID_STANDARD');
    expect(PRODUCTS.upgrade.stripePriceEnv).toBe('STRIPE_PRICE_ID_UPGRADE');
  });
});

describe('Upgrade purchase', () => {
  it('cannot be started before the standard report is paid, and premium content is never served unpaid', async () => {
    const h = makeHarness();
    const { sessionId, order } = await createPendingOrder(h);
    void sessionId;
    // Mint a token for the unpaid standard order directly (as an attacker holding a stale link might).
    const { mintAccessToken } = await import('../netlify/lib/tokens');
    const link = await mintAccessToken(h.db, { orderId: order.id, issuedVia: 'email', ttlDays: 0, now: h.clock.now, appUrl: 'https://app.test' });
    expect((await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token: link.token }), h.deps)).status).toBe(404);
    expect((await reportContent(post('/api/report-content', { token: link.token, tier: 'detailed' }), h.deps)).status).toBe(404);
  });

  it('creates one upgrade order and Stripe session with the upgrade price, idempotently', async () => {
    const h = makeHarness();
    const { order, token } = await paidStandard(h);
    const first = await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps);
    expect(first.status).toBe(200);
    const body = (await first.json()) as { checkoutUrl: string };
    expect(body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const upgrade = [...h.db.orders.values()].find((o) => o.product === 'upgrade')!;
    expect(upgrade.amount_minor).toBe(3400);
    expect(upgrade.parent_order_id).toBe(order.id);
    expect(upgrade.status).toBe('pending_payment');
    expect(h.gateway.created.at(-1)!.priceId).toBe(PRICE_ID_UPGRADE);
    // A second click re-uses the same upgrade order (no duplicate entitlement).
    await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps);
    expect([...h.db.orders.values()].filter((o) => o.product === 'upgrade')).toHaveLength(1);
    // Nothing premium yet: content and download are refused as not purchased.
    expect((await reportContent(post('/api/report-content', { token, tier: 'detailed' }), h.deps)).status).toBe(402);
    expect((await reportDownload(post('/api/report-download', { token, tier: 'detailed' }), h.deps)).status).toBe(402);
  });

  it('rejects an upgrade session paid at the standard price or amount', async () => {
    const h = makeHarness();
    const { token } = await paidStandard(h);
    await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps);
    const upgrade = [...h.db.orders.values()].find((o) => o.product === 'upgrade')!;
    const sessionId = upgrade.stripe_checkout_session_id!;
    h.gateway.pay(sessionId, { amountTotal: 1700, lineItems: [{ priceId: 'price_test_standard', quantity: 1 }] });
    const res = await deliverWebhook(h, sessionId, { eventId: 'evt_upg_bad' });
    expect(await res.json()).toMatchObject({ rejected: true });
    expect((await h.db.getOrder(upgrade.id))!.status).toBe('pending_payment');
    expect([...h.db.jobs.values()].filter((j) => j.order_id === upgrade.id)).toHaveLength(0);
  });

  it('a genuine upgrade payment creates exactly one job, runs the detailed pipeline, and unlocks premium content', async () => {
    const h = makeHarness();
    const { order, token } = await paidStandard(h);
    // Finish the standard report first.
    const stdJob = [...h.db.jobs.values()][0];
    expect((await runJob(jobDeps(h), stdJob.id, 'w1')).status).toBe('succeeded');
    const standardStatus = (await (await reportStatus(post('/api/report-status', { token }), h.deps)).json()) as { standard: { stage: string; emailSent: boolean }; detailed: unknown; upgrade: { available: boolean } };
    expect(standardStatus.standard.stage).toBe('email_sent');
    expect(standardStatus.detailed).toBeNull();
    expect(standardStatus.upgrade.available).toBe(true);

    await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps);
    const upgrade = [...h.db.orders.values()].find((o) => o.product === 'upgrade')!;
    const sessionId = upgrade.stripe_checkout_session_id!;
    h.gateway.pay(sessionId);
    await deliverWebhook(h, sessionId, { eventId: 'evt_upg_1' });
    await deliverWebhook(h, sessionId, { eventId: 'evt_upg_1' }); // duplicate
    await deliverWebhook(h, sessionId, { eventId: 'evt_upg_2', type: 'checkout.session.async_payment_succeeded' });
    const upgJobs = [...h.db.jobs.values()].filter((j) => j.order_id === upgrade.id);
    expect(upgJobs).toHaveLength(1);
    expect((await h.db.getOrder(upgrade.id))!.status).toBe('paid');
    expect([...h.db.jobs.values()]).toHaveLength(2); // one per purchased entitlement

    // The checkout return for the upgrade points at the same report page (standard order anchor).
    const ret = (await (await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps)).json()) as { state: string; product: string; reportRef: string };
    expect(ret).toMatchObject({ state: 'paid', product: 'upgrade' });

    const before = h.generator.researchCalls;
    expect((await runJob(jobDeps(h), upgJobs[0].id, 'w2')).status).toBe('succeeded');
    expect(h.generator.researchCalls).toBe(before + 1);
    const detailedReport = (await h.db.getReport(upgrade.id))!;
    expect(detailedReport.tier).toBe('detailed');
    expect(h.mailer.sent.filter((m) => m.subject.includes('Detailed Report Upgrade ready'))).toHaveLength(1);
    expect(h.db.deliveries.filter((d) => d.kind === 'detailed_report' && d.status === 'sent')).toHaveLength(1);

    const status = (await (await reportStatus(post('/api/report-status', { token }), h.deps)).json()) as { detailed: { purchased: boolean; stage: string } };
    expect(status.detailed).toMatchObject({ purchased: true, stage: 'email_sent' });
    const content = await reportContent(post('/api/report-content', { token, tier: 'detailed' }), h.deps);
    expect(content.status).toBe(200);
    expect(((await content.json()) as { content: { sections: unknown[] } }).content.sections).toHaveLength(9);
    // The standard report stays accessible.
    expect((await reportDownload(post('/api/report-download', { token, tier: 'standard' }), h.deps)).status).toBe(200);
    expect((await reportDownload(post('/api/report-download', { token, tier: 'detailed' }), h.deps)).status).toBe(200);
    expect((await h.db.getOrder(order.id))!.status).toBe('fulfilled');
    // A third purchase attempt is refused.
    expect((await createUpgradeCheckout(post('/api/create-upgrade-checkout', { token }), h.deps)).status).toBe(409);
  });
});

describe('Progress states come from the backend', () => {
  it('walks payment_confirmed → researching → writing → ready → email_sent and says email sent only after the mailer accepted', async () => {
    const h = makeHarness();
    const { token } = await paidStandard(h);
    const job = [...h.db.jobs.values()][0];
    const stage = async () => ((await (await reportStatus(post('/api/report-status', { token }), h.deps)).json()) as { standard: { stage: string } }).standard.stage;
    expect(await stage()).toBe('payment_confirmed');
    await h.db.claimJob(job.id, 'w', 60);
    await h.db.checkpointJob(job.id, 'w', 'research', {});
    expect(await stage()).toBe('researching');
    await h.db.checkpointJob(job.id, 'w', 'compose', {});
    expect(await stage()).toBe('writing');
    await h.db.checkpointJob(job.id, 'w', 'render', {});
    expect(await stage()).toBe('writing');
    await h.db.upsertReport(job.order_id, { status: 'rendered', pdf_object_path: 'orders/x/standard-v1.pdf' });
    expect(await stage()).toBe('ready');
    await h.db.recordDelivery({ order_id: job.order_id, job_id: job.id, kind: 'report', provider: 'resend', provider_message_id: null, status: 'failed', error: 'boom' });
    expect(await stage()).toBe('ready'); // a failed send is not "email sent"
    await h.db.recordDelivery({ order_id: job.order_id, job_id: job.id, kind: 'report', provider: 'resend', provider_message_id: 'm1', status: 'sent', error: null });
    expect(await stage()).toBe('email_sent');
  });

  it('a pending or cancelled checkout shows confirming_payment and never a report', async () => {
    const h = makeHarness();
    const { sessionId } = await createPendingOrder(h);
    expect(await (await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps)).json()).toMatchObject({ state: 'pending', product: 'standard' });
    await deliverWebhook(h, sessionId, { eventId: 'evt_exp', type: 'checkout.session.expired' });
    expect(await (await checkoutResult(get(`/api/checkout-result?session_id=${sessionId}`), h.deps)).json()).toMatchObject({ state: 'expired' });
    expect(h.db.jobs.size).toBe(0);
  });

  it('the two-page guard re-composes once and records page_count 2', async () => {
    const h = makeHarness();
    const { order } = await paidStandard(h);
    h.generator.overflowUntilTightened = true;
    let calls = 0;
    const deps = { ...jobDeps(h), renderStandard: async () => { calls += 1; return { pdf: Buffer.from('%PDF'), pageCount: calls === 1 ? 3 : 2 }; } };
    const job = [...h.db.jobs.values()][0];
    expect((await runJob(deps, job.id, 'w1')).status).toBe('succeeded');
    expect(h.generator.composeCalls).toBe(2);
    expect(h.generator.researchCalls).toBe(1);
    expect((await h.db.getReport(order.id))!.page_count).toBe(2);
  });
});
