import { describe, expect, it } from 'vitest';
import { createCheckout, createSubmission } from './api';
import { loadEnv, ConfigError } from '../netlify/lib/env';
import { redactValue } from '../netlify/lib/log';
import { makeHarness, post, validAnswers } from './helpers';

describe('Submission and checkout creation', () => {
  it('rejects oversized bodies', async () => {
    const h = makeHarness();
    const res = await createSubmission(post('/api/create-submission', { answers: { ideaSummary: 'x'.repeat(70_000) } }), h.deps);
    expect(res.status).toBe(413);
  });

  it('validates on the server and names the failing fields', async () => {
    const h = makeHarness();
    const answers = { ...validAnswers(), email: 'not-an-email', ackTerms: false, priceEstimate: { value: 'lots', unknown: false } };
    const res = await createSubmission(post('/api/create-submission', { answers }), h.deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: { errors: Record<string, string> } };
    expect(Object.keys(body.details.errors)).toEqual(expect.arrayContaining(['email', 'ackTerms', 'priceEstimate']));
    expect(h.db.submissions.size).toBe(0);
  });

  it('drops unknown keys and oversized values', async () => {
    const h = makeHarness();
    const answers = { ...validAnswers(), __proto__hack: 'x', amount: 1, ideaSummary: 'y'.repeat(5000) };
    const res = await createSubmission(post('/api/create-submission', { answers }), h.deps);
    expect(res.status).toBe(201);
    const sub = [...h.db.submissions.values()][0];
    expect('amount' in sub.answers).toBe(false);
    expect((sub.answers.ideaSummary as string).length).toBe(800);
  });

  it('a honeypot value fails closed', async () => {
    const h = makeHarness();
    const res = await createSubmission(post('/api/create-submission', { answers: validAnswers(), website: 'http://spam' }), h.deps);
    expect(res.status).toBe(400);
    expect(h.db.submissions.size).toBe(0);
  });

  it('the client cannot set the price: the order always uses the configured amount', async () => {
    const h = makeHarness();
    const sub = await createSubmission(post('/api/create-submission', { answers: validAnswers() }), h.deps);
    const { submissionId } = (await sub.json()) as { submissionId: string };
    const res = await createCheckout(post('/api/create-checkout', { submissionId, amount: 1, priceId: 'price_cheap', currency: 'usd' }), h.deps);
    expect(res.status).toBe(200);
    const order = [...h.db.orders.values()][0];
    expect(order.amount_minor).toBe(2400);
    expect(order.currency).toBe('GBP');
    expect(h.gateway.created[0].priceId).toBe('price_test_expected');
    expect(h.gateway.created[0].successUrl).toContain('{CHECKOUT_SESSION_ID}');
  });

  it('refuses checkout when the configured Stripe price does not match the product', async () => {
    const h = makeHarness();
    h.gateway.priceMismatch = true;
    const sub = await createSubmission(post('/api/create-submission', { answers: validAnswers() }), h.deps);
    const { submissionId } = (await sub.json()) as { submissionId: string };
    const res = await createCheckout(post('/api/create-checkout', { submissionId }), h.deps);
    expect(res.status).toBe(500);
    expect(h.db.orders.size).toBe(0);
  });

  it('checkout for an unknown submission is refused', async () => {
    const h = makeHarness();
    const res = await createCheckout(post('/api/create-checkout', { submissionId: '00000000-0000-4000-8000-000000000000' }), h.deps);
    expect(res.status).toBe(404);
  });

  it('rate limits repeated submissions from one address', async () => {
    const h = makeHarness();
    let last = 0;
    for (let i = 0; i < 11; i += 1) last = (await createSubmission(post('/api/create-submission', { answers: validAnswers() }), h.deps)).status;
    expect(last).toBe(429);
  });
});

describe('Configuration and logging safety', () => {
  it('missing configuration names the variables, never values', () => {
    expect(() => loadEnv(['stripe'], { IP_HASH_SALT: 's' })).toThrowError(ConfigError);
    try {
      loadEnv(['stripe', 'db'], { IP_HASH_SALT: 's', STRIPE_SECRET_KEY: 'sk_test_abc' });
    } catch (err) {
      const e = err as ConfigError;
      expect(e.missing).toEqual(['STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
      expect(e.message).not.toContain('sk_test_abc');
    }
  });

  it('the stub generator is refused in production', () => {
    expect(() => loadEnv([], { CONTEXT: 'production', IP_HASH_SALT: 's', REPORT_GENERATOR: 'stub' })).toThrowError(/not allowed in the production/);
  });

  it('logs redact tokens, emails and customer text', () => {
    const out = redactValue({ token: 'abc', email: 'x@y.com', answers: { ideaName: 'secret idea' }, note: 'mail me at a@b.co', ok: 1 }) as Record<string, unknown>;
    expect(out.token).toBe('[redacted]');
    expect(out.email).toBe('[redacted]');
    expect(out.answers).toBe('[redacted]');
    expect(out.note).toBe('mail me at [email]');
    expect(out.ok).toBe(1);
  });
});
