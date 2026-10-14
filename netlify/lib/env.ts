/*
  Environment loading with useful setup errors.

  Every secret is read here and nowhere else. A missing variable produces a
  ConfigError naming the variable (never its value) so a misconfigured deploy
  fails loudly with a 503 instead of pretending to work.
*/

export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[], hint?: string) {
    super(
      `Server not configured. Missing environment variable(s): ${missing.join(', ')}.` +
        (hint ? ` ${hint}` : '') +
        ' See docs/BACKEND.md for setup.',
    );
    this.name = 'ConfigError';
    this.missing = missing;
  }
}

export interface Env {
  /** Netlify deploy context: production | deploy-preview | branch-deploy | dev */
  context: string;
  isProduction: boolean;
  /** Public site origin used in emails and redirects, e.g. https://example.com */
  appUrl: string;

  supabaseUrl: string;
  supabaseServiceRoleKey: string;

  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePriceId: string;

  anthropicApiKey: string;
  anthropicModel: string;
  /** 'anthropic' in production; 'stub' allowed only outside production. */
  reportGenerator: 'anthropic' | 'stub';

  resendApiKey: string;
  emailFrom: string;
  emailReplyTo?: string;
  /** Optional: receives operational alerts (dead jobs). */
  ownerAlertEmail?: string;

  workerSecret: string;
  ipHashSalt: string;

  reportAccessDays: number;
  tokenTtlDays: number;
  recoveryTokenTtlDays: number;
}

type Source = Record<string, string | undefined>;

function read(src: Source, name: string): string | undefined {
  const v = src[name];
  return v === undefined || v === '' ? undefined : v;
}

function readInt(src: Source, name: string, fallback: number): number {
  const v = read(src, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ConfigError([name], `${name} must be a positive integer.`);
  return n;
}

/** Groups let a function demand only what it uses, so e.g. the status
 *  endpoint still works when the email provider is not configured yet. */
export type EnvGroup = 'db' | 'stripe' | 'anthropic' | 'email' | 'worker';

const GROUPS: Record<EnvGroup, string[]> = {
  db: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID'],
  anthropic: ['ANTHROPIC_API_KEY'],
  email: ['RESEND_API_KEY', 'EMAIL_FROM'],
  worker: ['WORKER_SECRET', 'IP_HASH_SALT'],
};

export function loadEnv(groups: EnvGroup[], src: Source = process.env): Env {
  const context = read(src, 'CONTEXT') ?? 'dev';
  const isProduction = context === 'production';
  const generator = (read(src, 'REPORT_GENERATOR') ?? 'anthropic') as 'anthropic' | 'stub';

  const required = new Set<string>(['IP_HASH_SALT']);
  for (const g of groups) for (const n of GROUPS[g]) required.add(n);
  // The stub generator needs no API key, but is forbidden in production.
  if (generator === 'stub') {
    if (isProduction) {
      throw new ConfigError(
        ['REPORT_GENERATOR'],
        'REPORT_GENERATOR=stub is not allowed in the production context. Remove it or set it to "anthropic".',
      );
    }
    required.delete('ANTHROPIC_API_KEY');
  }
  if (generator !== 'anthropic' && generator !== 'stub') {
    throw new ConfigError(['REPORT_GENERATOR'], 'REPORT_GENERATOR must be "anthropic" or "stub".');
  }

  const missing = [...required].filter((n) => read(src, n) === undefined);
  if (missing.length) throw new ConfigError(missing);

  const workerSecret = read(src, 'WORKER_SECRET');
  if (groups.includes('worker') && workerSecret && workerSecret.length < 32) {
    throw new ConfigError(['WORKER_SECRET'], 'WORKER_SECRET must be at least 32 characters (use `openssl rand -hex 32`).');
  }

  // Public origin for emails, Stripe redirects and worker invocation.
  // APP_URL wins. Otherwise Netlify's DEPLOY_PRIME_URL points at *this*
  // deploy (branch or preview subdomain), whereas URL is always the
  // production site, so a test deploy must not fall back to URL first.
  const appUrl = (read(src, 'APP_URL') ?? read(src, 'DEPLOY_PRIME_URL') ?? read(src, 'URL') ?? 'http://localhost:8888').replace(/\/+$/, '');

  return {
    context,
    isProduction,
    appUrl,
    supabaseUrl: read(src, 'SUPABASE_URL') ?? '',
    supabaseServiceRoleKey: read(src, 'SUPABASE_SERVICE_ROLE_KEY') ?? '',
    stripeSecretKey: read(src, 'STRIPE_SECRET_KEY') ?? '',
    stripeWebhookSecret: read(src, 'STRIPE_WEBHOOK_SECRET') ?? '',
    stripePriceId: read(src, 'STRIPE_PRICE_ID') ?? '',
    anthropicApiKey: read(src, 'ANTHROPIC_API_KEY') ?? '',
    anthropicModel: read(src, 'ANTHROPIC_MODEL') ?? 'claude-opus-5-5',
    reportGenerator: generator,
    resendApiKey: read(src, 'RESEND_API_KEY') ?? '',
    emailFrom: read(src, 'EMAIL_FROM') ?? '',
    emailReplyTo: read(src, 'EMAIL_REPLY_TO'),
    ownerAlertEmail: read(src, 'OWNER_ALERT_EMAIL'),
    workerSecret: workerSecret ?? '',
    ipHashSalt: read(src, 'IP_HASH_SALT') ?? '',
    reportAccessDays: readInt(src, 'REPORT_ACCESS_DAYS', 90),
    tokenTtlDays: readInt(src, 'TOKEN_TTL_DAYS', 30),
    recoveryTokenTtlDays: readInt(src, 'RECOVERY_TOKEN_TTL_DAYS', 7),
  };
}

/** Names that may be reported publicly in a setup error. Values never are. */
export function describeMissing(err: ConfigError): { error: string; missing: string[] } {
  return { error: 'not_configured', missing: err.missing };
}
