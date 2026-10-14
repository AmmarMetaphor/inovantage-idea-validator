/*
  Test harness: real handlers over in-memory persistence, a fake payment
  gateway that uses Stripe's real signature algorithm, and recording doubles
  for email, blobs and the worker.
*/
import Stripe from 'stripe';
import { sha256Hex } from '../netlify/lib/crypto';
import { MemoryBlobStore, MemoryDb } from '../netlify/lib/db/memory';
import type { Deps } from '../netlify/lib/deps';
import { loadEnv } from '../netlify/lib/env';
import { silentLogger } from '../netlify/lib/log';
import { MemoryMailer } from '../netlify/lib/mailer';
import type { PaymentGateway, VerifiedSession, WebhookEventLite } from '../netlify/lib/payments';
import { WebhookSignatureError } from '../netlify/lib/payments';
import { StubGenerator } from '../netlify/lib/research';

export const WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';
export const PRICE_ID = 'price_test_expected';
export const WORKER_SECRET = 'w'.repeat(48);

export const TEST_ENV = {
  CONTEXT: 'dev',
  APP_URL: 'https://app.test',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_ID: PRICE_ID,
  ANTHROPIC_API_KEY: 'anthropic-placeholder',
  RESEND_API_KEY: 'resend-placeholder',
  EMAIL_FROM: 'Inovantage <reports@app.test>',
  WORKER_SECRET,
  IP_HASH_SALT: 'salt',
  REPORT_GENERATOR: 'stub',
};

export class FakeGateway implements PaymentGateway {
  sessions = new Map<string, VerifiedSession>();
  created: Parameters<PaymentGateway['createCheckoutSession']>[0][] = [];
  private stripe = new Stripe('sk_test_placeholder');
  priceMismatch = false;

  async verifyPrice(priceId: string) {
    if (this.priceMismatch || priceId !== PRICE_ID) throw new Error(`Stripe price ${priceId} does not match the configured product.`);
  }
  async createCheckoutSession(input: Parameters<PaymentGateway['createCheckoutSession']>[0]) {
    this.created.push(input);
    const id = `cs_test_${this.created.length.toString().padStart(12, '0')}`;
    this.sessions.set(id, {
      id, url: `https://checkout.stripe.test/${id}`, mode: 'payment', paymentStatus: 'unpaid', status: 'open',
      amountTotal: 2400, currency: 'gbp', paymentIntentId: null, clientReferenceId: input.orderId, metadataOrderId: input.orderId,
      lineItems: [{ priceId: input.priceId, quantity: 1 }], customerEmail: input.customerEmail, created: Math.floor(Date.now() / 1000),
    });
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAtUnix: input.expiresAtUnix };
  }
  async retrieveSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    return s ? { ...s, lineItems: s.lineItems.map((l) => ({ ...l })) } : null;
  }
  async verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookEventLite> {
    if (!signatureHeader) throw new WebhookSignatureError('missing');
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(rawBody, signatureHeader, WEBHOOK_SECRET);
    } catch (err) {
      throw new WebhookSignatureError(err instanceof Error ? err.message : 'bad');
    }
    const obj = event.data.object as { object?: string; id?: string };
    return { id: event.id, type: event.type, sessionId: obj.object === 'checkout.session' && obj.id ? obj.id : null, rawPayloadHash: sha256Hex(rawBody) };
  }

  /** Mark a session paid at "Stripe", optionally with tampered fields. */
  pay(sessionId: string, patch: Partial<VerifiedSession> = {}) {
    const s = this.sessions.get(sessionId)!;
    Object.assign(s, { paymentStatus: 'paid', status: 'complete', paymentIntentId: `pi_${sessionId.slice(-6)}` }, patch);
  }

  /** Build a signed webhook payload for a session. */
  signedEvent(sessionId: string, opts: { eventId?: string; type?: string; secret?: string } = {}) {
    const payload = JSON.stringify({
      id: opts.eventId ?? `evt_${sessionId}`,
      object: 'event',
      type: opts.type ?? 'checkout.session.completed',
      data: { object: { object: 'checkout.session', id: sessionId } },
    });
    const header = this.stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET });
    return { payload, header };
  }
}

export interface Harness {
  deps: Deps;
  db: MemoryDb;
  blobs: MemoryBlobStore;
  mailer: MemoryMailer;
  gateway: FakeGateway;
  generator: StubGenerator;
  workerCalls: string[];
  clock: { now: Date; advance(ms: number): void };
}

export function makeHarness(envOverrides: Record<string, string> = {}): Harness {
  const clock = { now: new Date('2026-10-14T10:00:00Z'), advance(ms: number) { clock.now = new Date(clock.now.getTime() + ms); } };
  const db = new MemoryDb(() => clock.now);
  const blobs = new MemoryBlobStore();
  const mailer = new MemoryMailer();
  const gateway = new FakeGateway();
  const generator = new StubGenerator();
  const workerCalls: string[] = [];
  const env = loadEnv([], { ...TEST_ENV, ...envOverrides });
  const deps: Deps = {
    env, db, blobs, payments: gateway, mailer, generator, log: silentLogger,
    now: () => clock.now,
    async invokeWorker(jobId) { workerCalls.push(jobId); },
  };
  return { deps, db, blobs, mailer, gateway, generator, workerCalls, clock };
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}, raw = false): Request {
  const payload = raw ? (body as string) : JSON.stringify(body);
  return new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '203.0.113.9', ...headers }, body: payload });
}

export function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.test${path}`, { method: 'GET', headers: { 'x-nf-client-connection-ip': '203.0.113.9', ...headers } });
}

export function validAnswers(email = 'founder@example.com') {
  return {
    ideaName: 'Northside Mobile Dog Grooming',
    ideaSummary: 'Van-based grooming at home for dog owners in north Leeds.',
    industry: 'personal-services',
    stage: 'idea',
    problem: 'Owners of anxious dogs struggle with salon visits.',
    offer: 'Full groom or wash-and-tidy at the customer home.',
    customerDescription: 'Dog owners in north Leeds with medium/large breeds.',
    customerType: 'b2c',
    country: 'UK',
    regionCity: 'Leeds',
    serviceArea: 'local',
    alternatives: 'Salon groomers; some DIY.',
    currency: 'GBP',
    priceEstimate: { value: '45', unknown: false },
    priceBasis: 'per-unit',
    revenueModel: 'one-off',
    competitors: 'Two local mobile groomers, one salon.',
    differentiation: 'Calm handling for anxious dogs, at home.',
    capital: { value: '8000', unknown: false },
    hoursPerWeek: '20-35',
    industryExperience: 'none',
    founderExperience: 'first',
    incomeObjective: 'replace',
    incomeTarget: { value: '', unknown: true },
    timeframe: '3-6',
    startupCosts: { value: '', unknown: true },
    fixedCosts: { value: '650', unknown: false },
    perSaleCost: { value: '7', unknown: false },
    acquisitionChannels: ['word-of-mouth', 'social'],
    demandEvidence: ['conversations'],
    demandEvidenceDetail: 'Spoke to 12 owners at the park.',
    biggestConcern: 'Is there enough demand near me?',
    email,
    ackScope: true,
    ackAccuracy: true,
    ackTerms: true,
  };
}

/** Full happy path up to an unpaid checkout session. */
export async function createPendingOrder(h: Harness, email = 'founder@example.com') {
  const { createSubmission, createCheckout } = await import('./api');
  const sub = await createSubmission(post('/api/create-submission', { answers: validAnswers(email), website: '' }), h.deps);
  if (sub.status !== 201) throw new Error(`submission failed: ${await sub.text()}`);
  const { submissionId } = (await sub.json()) as { submissionId: string };
  const co = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
  if (co.status !== 200) throw new Error(`checkout failed: ${await co.text()}`);
  const { checkoutUrl } = (await co.json()) as { checkoutUrl: string };
  const sessionId = checkoutUrl.split('/').pop()!;
  const order = (await h.db.getOrderByCheckoutSession(sessionId))!;
  return { submissionId, sessionId, order };
}

/** Deliver a signed, genuine webhook for a session (after gateway.pay). */
export async function deliverWebhook(h: Harness, sessionId: string, opts: { eventId?: string; secret?: string; type?: string } = {}) {
  const { stripeWebhook } = await import('./api');
  const { payload, header } = h.gateway.signedEvent(sessionId, opts);
  return stripeWebhook(post('/api/stripe-webhook', payload, { 'stripe-signature': header }, true), h.deps);
}
