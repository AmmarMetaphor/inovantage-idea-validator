/*
  Dependency container. Each external service is constructed lazily the
  first time a handler touches it, and construction validates the environment
  group it needs. A missing variable surfaces as a ConfigError → HTTP 503 with
  the variable names, so a half-configured deploy fails clearly and never
  fakes success.
*/
import { sha256Hex } from './crypto';
import { createSupabase, SupabaseBlobStore, SupabaseDb } from './db/supabase';
import type { BlobStore, Db } from './db/types';
import { loadEnv, type Env, type EnvGroup } from './env';
import { createLogger, type Logger } from './log';
import { ResendMailer, type Mailer } from './mailer';
import { StripeGateway, type PaymentGateway } from './payments';
import { AnthropicGenerator, StubGenerator, type ReportGenerator } from './research';

export interface Deps {
  readonly env: Env;
  readonly db: Db;
  readonly blobs: BlobStore;
  readonly payments: PaymentGateway;
  readonly mailer: Mailer;
  readonly generator: ReportGenerator;
  readonly log: Logger;
  now(): Date;
  invokeWorker(jobId: string): Promise<void>;
}

export const WORKER_PATH = '/.netlify/functions/report-worker-background';

export function buildDeps(opts: { requestId: string; fn: string }): Deps {
  const log = createLogger({ fn: opts.fn, request_id: opts.requestId });
  let env: Env | undefined;
  const envFor = (groups: EnvGroup[]) => loadEnv(groups);

  let db: Db | undefined;
  let blobs: BlobStore | undefined;
  let payments: PaymentGateway | undefined;
  let mailer: Mailer | undefined;
  let generator: ReportGenerator | undefined;

  const supabase = () => {
    const e = envFor(['db']);
    return createSupabase(e.supabaseUrl, e.supabaseServiceRoleKey);
  };

  return {
    get env() {
      return (env ??= envFor([]));
    },
    get db() {
      return (db ??= new SupabaseDb(supabase()));
    },
    get blobs() {
      return (blobs ??= new SupabaseBlobStore(supabase()));
    },
    get payments() {
      if (!payments) {
        const e = envFor(['stripe']);
        payments = new StripeGateway(e.stripeSecretKey, e.stripeWebhookSecret, sha256Hex);
      }
      return payments;
    },
    get mailer() {
      if (!mailer) {
        const e = envFor(['email']);
        mailer = new ResendMailer(e.resendApiKey, e.emailFrom, e.emailReplyTo);
      }
      return mailer;
    },
    get generator() {
      if (!generator) {
        const e = envFor(['anthropic']);
        generator = e.reportGenerator === 'stub' ? new StubGenerator() : new AnthropicGenerator(e.anthropicApiKey, e.anthropicModel);
      }
      return generator;
    },
    log,
    now: () => new Date(),
    async invokeWorker(jobId: string) {
      const e = envFor(['worker']);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${e.appUrl}${WORKER_PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${e.workerSecret}` },
          body: JSON.stringify({ jobId }),
          signal: controller.signal,
        });
        if (res.status !== 202 && res.status !== 200) throw new Error(`worker invoke returned ${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
