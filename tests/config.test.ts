import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { loadEnv } from '../netlify/lib/env';
import { StripeGateway } from '../netlify/lib/payments';
import { sha256Hex } from '../netlify/lib/crypto';

describe('Deploy URL resolution', () => {
  const base = { IP_HASH_SALT: 's' };
  it('prefers APP_URL over Netlify-provided URLs', () => {
    const env = loadEnv([], { ...base, APP_URL: 'https://custom.example/', DEPLOY_PRIME_URL: 'https://branch--site.netlify.app', URL: 'https://site.netlify.app' });
    expect(env.appUrl).toBe('https://custom.example');
  });
  it('uses the current deploy (DEPLOY_PRIME_URL) before the production URL', () => {
    const env = loadEnv([], { ...base, DEPLOY_PRIME_URL: 'https://branch--site.netlify.app', URL: 'https://site.netlify.app' });
    expect(env.appUrl).toBe('https://branch--site.netlify.app');
  });
  it('falls back to URL, then localhost', () => {
    expect(loadEnv([], { ...base, URL: 'https://site.netlify.app' }).appUrl).toBe('https://site.netlify.app');
    expect(loadEnv([], base).appUrl).toBe('http://localhost:8888');
  });
});

describe('Stripe client', () => {
  it('sends the API version pinned by the installed SDK, not a hand-written one', () => {
    // getApiField is a runtime method the SDK does not type; read it through a narrow cast.
    type WithField = { getApiField(key: string): unknown };
    const gateway = new StripeGateway('sk_test_placeholder', 'whsec_placeholder', sha256Hex);
    const sent = String((gateway as unknown as { stripe: WithField }).stripe.getApiField('version'));
    const sdkPinned = String((new Stripe('sk_test_placeholder') as unknown as WithField).getApiField('version'));
    expect(sent).toBe(sdkPinned);
    expect(sent).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(sent).not.toBe('2026-09-30.clover');
  });
});
