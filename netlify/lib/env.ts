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

/** Deploy metadata Netlify injects (COMMIT_REF, DEPLOY_ID); never secrets. */
export function buildInfo(src: Source = process.env): { commit: string | null; deploy_id: string | null; context: string } {
  const get = (k: string) => {
    const v = src[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return { commit: get('COMMIT_REF'), deploy_id: get('DEPLOY_ID'), context: get('CONTEXT') ?? 'dev' };
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
  /** Stripe Price IDs per product. Verified against product.ts amounts at checkout. */
  stripePriceIds: { standard: string; upgrade: string };

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

  /** Owner-only pilot (no Stripe). Off unless PILOT_MODE=true. */
  pilotMode: boolean;
  pilotOwnerPassword: string;
  pilotSessionSecret: string;
  /** Normalised addresses the pilot may deliver to. Enforced server-side. */
  pilotAllowedEmails: string[];

  /** 0 = no preset expiry (default). A positive number sets report_expires_at at purchase. */
  reportAccessDays: number;
  /** Lifetime of tokens minted on the checkout return page and by recovery. Email links do not expire. */
  tokenTtlDays: number;
  recoveryTokenTtlDays: number;
}

type Source = Record<string, string | undefined>;

function read(src: Source, name: string): string | undefined {
  const v = src[name];
  return v === undefined || v === '' ? undefined : v;
}

function readInt(src: Source, name: string, fallback: number, min = 1): number {
  const v = read(src, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new ConfigError([name], `${name} must be an integer of at least ${min}.`);
  return n;
}

/** Groups let a function demand only what it uses, so e.g. the status
 *  endpoint still works when the email provider is not configured yet. */
export type EnvGroup = 'db' | 'stripe' | 'anthropic' | 'email' | 'worker' | 'pilot';

const GROUPS: Record<EnvGroup, string[]> = {
  db: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_STANDARD', 'STRIPE_PRICE_ID_UPGRADE'],
  anthropic: ['ANTHROPIC_API_KEY'],
  email: ['RESEND_API_KEY', 'EMAIL_FROM'],
  worker: ['WORKER_SECRET', 'IP_HASH_SALT'],
  pilot: ['PILOT_OWNER_PASSWORD', 'PILOT_SESSION_SECRET'],
};

/** The only address the pilot may deliver to unless PILOT_ALLOWED_EMAILS overrides it. */
export const DEFAULT_PILOT_ALLOWED_EMAILS = ['support@metaphorconsultants.com'];

/**
 * Accepts a legacy service_role JWT or a new-format `sb_secret_…` key.
 * Rejects anything that is visibly a public key, so a misplaced anon or
 * publishable key fails at startup instead of silently hitting RLS walls.
 */
export function checkSupabaseServerKey(key: string): string | null {
  if (key.startsWith('sb_secret_')) return null;
  if (key.startsWith('sb_publishable_')) return 'SUPABASE_SERVICE_ROLE_KEY is a publishable (public) key; use the sb_secret_ key.';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { role?: string };
      if (payload.role === 'anon') return 'SUPABASE_SERVICE_ROLE_KEY is the anon (public) key; use the service_role or sb_secret_ key.';
      if (payload.role === 'service_role') return null;
    } catch {
      /* fall through */
    }
  }
  return 'SUPABASE_SERVICE_ROLE_KEY is not a recognised Supabase server key (expected sb_secret_… or a service_role JWT).';
}

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
  const serverKey = read(src, 'SUPABASE_SERVICE_ROLE_KEY');
  if (groups.includes('db') && serverKey) {
    const problem = checkSupabaseServerKey(serverKey);
    if (problem) throw new ConfigError(['SUPABASE_SERVICE_ROLE_KEY'], problem);
  }

  const pilotMode = read(src, 'PILOT_MODE') === 'true';
  const pilotPassword = read(src, 'PILOT_OWNER_PASSWORD') ?? '';
  const pilotSecret = read(src, 'PILOT_SESSION_SECRET') ?? '';
  if (groups.includes('pilot')) {
    if (!pilotMode) throw new ConfigError(['PILOT_MODE'], 'The owner pilot is disabled. Set PILOT_MODE=true to enable it.');
    if (pilotPassword.length < 12) throw new ConfigError(['PILOT_OWNER_PASSWORD'], 'PILOT_OWNER_PASSWORD must be at least 12 characters.');
    if (pilotSecret.length < 32) throw new ConfigError(['PILOT_SESSION_SECRET'], 'PILOT_SESSION_SECRET must be at least 32 characters (use `openssl rand -hex 32`).');
  }
  const pilotAllowedEmails = (read(src, 'PILOT_ALLOWED_EMAILS') ?? DEFAULT_PILOT_ALLOWED_EMAILS.join(','))
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

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
    stripePriceIds: {
      standard: read(src, 'STRIPE_PRICE_ID_STANDARD') ?? '',
      upgrade: read(src, 'STRIPE_PRICE_ID_UPGRADE') ?? '',
    },
    anthropicApiKey: read(src, 'ANTHROPIC_API_KEY') ?? '',
    anthropicModel: read(src, 'ANTHROPIC_MODEL') ?? 'claude-opus-5-5',
    reportGenerator: generator,
    resendApiKey: read(src, 'RESEND_API_KEY') ?? '',
    emailFrom: read(src, 'EMAIL_FROM') ?? '',
    emailReplyTo: read(src, 'EMAIL_REPLY_TO'),
    ownerAlertEmail: read(src, 'OWNER_ALERT_EMAIL'),
    workerSecret: workerSecret ?? '',
    ipHashSalt: read(src, 'IP_HASH_SALT') ?? '',
    pilotMode,
    pilotOwnerPassword: pilotPassword,
    pilotSessionSecret: pilotSecret,
    pilotAllowedEmails,
    reportAccessDays: readInt(src, 'REPORT_ACCESS_DAYS', 0, 0),
    tokenTtlDays: readInt(src, 'TOKEN_TTL_DAYS', 30),
    recoveryTokenTtlDays: readInt(src, 'RECOVERY_TOKEN_TTL_DAYS', 30),
  };
}

/** Names that may be reported publicly in a setup error. Values never are. */
export function describeMissing(err: ConfigError): { error: string; missing: string[] } {
  return { error: 'not_configured', missing: err.missing };
}
