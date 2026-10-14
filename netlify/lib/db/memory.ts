/*
  In-memory Db + BlobStore for tests. Mirrors the SQL constraints that matter
  for correctness: unique checkout session / payment intent, unique webhook
  event, one job per order, atomic claim semantics.
*/
import { randomUUID } from 'node:crypto';
import type {
  AccessToken, BlobStore, Db, DeliveryAttempt, DeliveryKind, Job, JobStage, Json, Order, OrderStatus,
  Report, ReportClaim, ResearchSource, Submission, WebhookEvent, WebhookEventStatus,
} from './types';

export class UniqueViolation extends Error {
  constructor(what: string) {
    super(`unique violation: ${what}`);
    this.name = 'UniqueViolation';
  }
}

export class MemoryDb implements Db {
  submissions = new Map<string, Submission & { ip_hash?: string; user_agent_hash?: string }>();
  orders = new Map<string, Order>();
  jobs = new Map<string, Job>();
  sources = new Map<string, ResearchSource[]>();
  reports = new Map<string, Report>();
  claims = new Map<string, ReportClaim[]>();
  tokens = new Map<string, AccessToken>();
  events = new Map<string, WebhookEvent>();
  deliveries: DeliveryAttempt[] = [];
  rateLimits = new Map<string, { windowStart: number; count: number }>();

  constructor(private now: () => Date = () => new Date()) {}

  private ts() {
    return this.now().toISOString();
  }

  async createSubmission(input: Parameters<Db['createSubmission']>[0]): Promise<Submission> {
    const s = { id: randomUUID(), created_at: this.ts(), status: 'draft' as const, ...input };
    this.submissions.set(s.id, s);
    return s;
  }
  async getSubmission(id: string) {
    return this.submissions.get(id) ?? null;
  }
  async setSubmissionStatus(id: string, status: Submission['status']) {
    const s = this.submissions.get(id);
    if (s) s.status = status;
  }

  async createOrder(input: Parameters<Db['createOrder']>[0]): Promise<Order> {
    for (const o of this.orders.values()) if (o.submission_id === input.submission_id) throw new UniqueViolation('orders.submission_id');
    const o: Order = {
      id: randomUUID(), created_at: this.ts(), status: 'pending_payment',
      stripe_checkout_session_id: null, stripe_payment_intent_id: null, checkout_expires_at: null,
      paid_at: null, fulfilled_at: null, failed_reason: null, report_expires_at: null, ...input,
    };
    this.orders.set(o.id, o);
    return o;
  }
  async getOrder(id: string) {
    return this.orders.get(id) ?? null;
  }
  async getOrderBySubmission(submissionId: string) {
    return [...this.orders.values()].find((o) => o.submission_id === submissionId) ?? null;
  }
  async getOrderByCheckoutSession(sessionId: string) {
    return [...this.orders.values()].find((o) => o.stripe_checkout_session_id === sessionId) ?? null;
  }
  async attachCheckoutSession(orderId: string, sessionId: string, expiresAt: string) {
    for (const o of this.orders.values()) if (o.stripe_checkout_session_id === sessionId && o.id !== orderId) throw new UniqueViolation('orders.stripe_checkout_session_id');
    const o = this.orders.get(orderId)!;
    o.stripe_checkout_session_id = sessionId;
    o.checkout_expires_at = expiresAt;
  }
  async markOrderPaid({ orderId, paymentIntentId, paidAt, reportExpiresAt }: Parameters<Db['markOrderPaid']>[0]) {
    const o = this.orders.get(orderId);
    if (!o) throw new Error('order not found');
    if (o.status !== 'pending_payment') return { applied: false, order: o };
    for (const other of this.orders.values()) if (other.stripe_payment_intent_id === paymentIntentId && other.id !== orderId) throw new UniqueViolation('orders.stripe_payment_intent_id');
    o.status = 'paid';
    o.stripe_payment_intent_id = paymentIntentId;
    o.paid_at = paidAt;
    o.report_expires_at = reportExpiresAt;
    return { applied: true, order: o };
  }
  async setOrderStatus(orderId: string, status: OrderStatus, extra?: { failed_reason?: string; fulfilled_at?: string }) {
    const o = this.orders.get(orderId);
    if (!o) return;
    o.status = status;
    if (extra?.failed_reason !== undefined) o.failed_reason = extra.failed_reason;
    if (extra?.fulfilled_at !== undefined) o.fulfilled_at = extra.fulfilled_at;
  }
  async findActiveOrdersByEmail(emailNormalised: string, now: string, limit: number) {
    return [...this.orders.values()]
      .filter((o) => o.email_normalised === emailNormalised && (o.status === 'paid' || o.status === 'fulfilled') && (!o.report_expires_at || o.report_expires_at > now))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  async expireStaleCheckouts(now: string) {
    let n = 0;
    for (const o of this.orders.values()) {
      if (o.status === 'pending_payment' && o.checkout_expires_at && o.checkout_expires_at < now) {
        o.status = 'expired';
        n += 1;
      }
    }
    return n;
  }

  async insertWebhookEvent(input: Parameters<Db['insertWebhookEvent']>[0]) {
    const key = `${input.provider}:${input.event_id}`;
    const existing = this.events.get(key);
    if (existing) return { created: false, event: existing };
    const ev: WebhookEvent = { id: randomUUID(), status: 'received', received_at: this.ts(), processed_at: null, order_id: null, error: null, ...input };
    this.events.set(key, ev);
    return { created: true, event: ev };
  }
  async updateWebhookEvent(id: string, patch: { status: WebhookEventStatus; error?: string | null; order_id?: string | null; processed_at?: string | null }) {
    for (const ev of this.events.values()) if (ev.id === id) Object.assign(ev, patch);
  }

  async createJob(input: { order_id: string; type: string }) {
    const existing = [...this.jobs.values()].find((j) => j.order_id === input.order_id && j.type === input.type);
    if (existing) return { created: false, job: existing };
    const job: Job = {
      id: randomUUID(), created_at: this.ts(), status: 'queued', stage: 'confirm', checkpoint: {}, attempts: 0, max_attempts: 5,
      run_after: this.ts(), lease_owner: null, lease_expires_at: null, started_at: null, finished_at: null, last_error: null, ...input,
    };
    this.jobs.set(job.id, job);
    return { created: true, job };
  }
  async getJob(id: string) {
    return this.jobs.get(id) ?? null;
  }
  async getJobForOrder(orderId: string, type: string) {
    return [...this.jobs.values()].find((j) => j.order_id === orderId && j.type === type) ?? null;
  }
  async claimJob(jobId: string, workerId: string, leaseSeconds: number) {
    const j = this.jobs.get(jobId);
    if (!j) return null;
    const now = this.now();
    const nowIso = now.toISOString();
    const claimable =
      j.attempts < j.max_attempts &&
      j.run_after <= nowIso &&
      (j.status === 'queued' || (j.status === 'running' && !!j.lease_expires_at && j.lease_expires_at < nowIso));
    if (!claimable) return null;
    j.status = 'running';
    j.lease_owner = workerId;
    j.lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    j.attempts += 1;
    j.started_at ??= nowIso;
    return { ...j };
  }
  async extendLease(jobId: string, workerId: string, leaseSeconds: number) {
    const j = this.jobs.get(jobId);
    if (!j || j.status !== 'running' || j.lease_owner !== workerId) return false;
    j.lease_expires_at = new Date(this.now().getTime() + leaseSeconds * 1000).toISOString();
    return true;
  }
  async checkpointJob(jobId: string, workerId: string, stage: JobStage, checkpoint: Json) {
    const j = this.jobs.get(jobId);
    if (!j || j.lease_owner !== workerId) throw new Error('lease lost');
    j.stage = stage;
    j.checkpoint = checkpoint;
  }
  async completeJob(jobId: string, workerId: string) {
    const j = this.jobs.get(jobId);
    if (!j || j.lease_owner !== workerId) throw new Error('lease lost');
    j.status = 'succeeded';
    j.stage = 'done';
    j.finished_at = this.ts();
    j.lease_owner = null;
    j.lease_expires_at = null;
  }
  async failJob(jobId: string, workerId: string, { error, retryAt }: { error: string; retryAt: string | null }) {
    const j = this.jobs.get(jobId);
    if (!j || j.lease_owner !== workerId) throw new Error('lease lost');
    j.last_error = error;
    j.lease_owner = null;
    j.lease_expires_at = null;
    if (retryAt && j.attempts < j.max_attempts) {
      j.status = 'queued';
      j.run_after = retryAt;
    } else {
      j.status = 'dead';
      j.finished_at = this.ts();
    }
    return { ...j };
  }
  async findRunnableJobs(now: string, limit: number) {
    return [...this.jobs.values()].filter((j) => j.status === 'queued' && j.run_after <= now && j.attempts < j.max_attempts).slice(0, limit);
  }
  async recoverStalledJobs() {
    const nowIso = this.ts();
    const out: Job[] = [];
    for (const j of this.jobs.values()) {
      if (j.status === 'running' && j.lease_expires_at && j.lease_expires_at < nowIso) {
        j.status = j.attempts >= j.max_attempts ? 'dead' : 'queued';
        j.lease_owner = null;
        j.lease_expires_at = null;
        j.last_error ??= 'lease expired without completion';
        out.push({ ...j });
      }
    }
    return out;
  }

  async replaceResearchSources(orderId: string, sources: ResearchSource[]) {
    const seen = new Set<string>();
    this.sources.set(orderId, sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))));
  }
  async getResearchSources(orderId: string) {
    return this.sources.get(orderId) ?? [];
  }
  async upsertReport(orderId: string, patch: Partial<Omit<Report, 'id' | 'order_id'>>) {
    let r = this.reports.get(orderId);
    if (!r) {
      r = { id: randomUUID(), order_id: orderId, version: 1, status: 'generating', content: null, verdict: null, model: null, input_tokens: null, output_tokens: null, generated_at: null, pdf_object_path: null, pdf_bytes: null, rendered_at: null, delivered_at: null };
      this.reports.set(orderId, r);
    }
    Object.assign(r, patch);
    return { ...r };
  }
  async getReport(orderId: string) {
    const r = this.reports.get(orderId);
    return r ? { ...r } : null;
  }
  async replaceReportClaims(reportId: string, claims: ReportClaim[]) {
    this.claims.set(reportId, claims);
  }

  async createAccessToken(input: Parameters<Db['createAccessToken']>[0]) {
    if (this.tokens.has(input.token_hash)) throw new UniqueViolation('access_tokens.token_hash');
    const t: AccessToken = { id: randomUUID(), purpose: 'report_access', revoked_at: null, use_count: 0, ...input };
    this.tokens.set(t.token_hash, t);
    return t;
  }
  async findAccessToken(tokenHash: string) {
    return this.tokens.get(tokenHash) ?? null;
  }
  async touchAccessToken(id: string) {
    for (const t of this.tokens.values()) if (t.id === id) t.use_count += 1;
  }

  async recordDelivery(input: Omit<DeliveryAttempt, 'id' | 'created_at'>) {
    this.deliveries.push({ id: randomUUID(), created_at: this.ts(), ...input });
  }
  async hasDelivery(orderId: string, kind: DeliveryKind) {
    return this.deliveries.some((d) => d.order_id === orderId && d.kind === kind && d.status === 'sent');
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number) {
    const now = this.now().getTime();
    const rl = this.rateLimits.get(key);
    if (!rl || rl.windowStart + windowSeconds * 1000 <= now) {
      this.rateLimits.set(key, { windowStart: now, count: 1 });
      return { allowed: true, remaining: limit - 1 };
    }
    rl.count += 1;
    return { allowed: rl.count <= limit, remaining: Math.max(limit - rl.count, 0) };
  }
  async pruneRateLimits() {
    return 0;
  }
}

export class MemoryBlobStore implements BlobStore {
  objects = new Map<string, Buffer>();
  async putPdf(path: string, bytes: Buffer) {
    this.objects.set(path, bytes);
  }
  async getPdf(path: string) {
    const b = this.objects.get(path);
    if (!b) throw new Error('object not found');
    return b;
  }
  async createSignedUrl(path: string, expiresInSeconds: number) {
    if (!this.objects.has(path)) throw new Error('object not found');
    return `https://blobs.test/${path}?signed=1&exp=${expiresInSeconds}`;
  }
}
