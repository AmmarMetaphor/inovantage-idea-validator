/*
  Supabase implementation of Db and BlobStore.

  Uses the SERVICE ROLE key, which bypasses RLS. This file must only ever run
  inside Netlify Functions. The anon key is never used server-side and the
  browser never talks to Supabase directly.
*/
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AccessToken, BlobStore, Db, DeliveryAttempt, DeliveryKind, Job, JobStage, Json, Order, OrderStatus,
  Report, ReportClaim, ResearchSource, Submission, WebhookEvent, WebhookEventStatus,
} from './types';

export class DbError extends Error {
  code?: string;
  constructor(op: string, err: { message: string; code?: string }) {
    super(`${op}: ${err.message}`);
    this.name = 'DbError';
    this.code = err.code;
  }
}

const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof DbError && err.code === UNIQUE_VIOLATION;
}

export function createSupabase(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-application-name': 'inovantage-functions' } },
  });
}

function one<T>(op: string, res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new DbError(op, res.error);
  if (res.data === null) throw new DbError(op, { message: 'no row returned' });
  return res.data;
}

function maybe<T>(op: string, res: { data: T | null; error: { message: string; code?: string } | null }): T | null {
  if (res.error) {
    if (res.error.code === 'PGRST116') return null; // zero rows for .single()
    throw new DbError(op, res.error);
  }
  return res.data;
}

function check(op: string, res: { error: { message: string; code?: string } | null }): void {
  if (res.error) throw new DbError(op, res.error);
}

export class SupabaseDb implements Db {
  constructor(private sb: SupabaseClient) {}

  async createSubmission(input: Parameters<Db['createSubmission']>[0]) {
    const ins = await this.sb.from('submissions').insert(input).select('*').single<Submission>();
    if (!ins.error) return { submission: ins.data, created: true };
    if (ins.error.code !== UNIQUE_VIOLATION || !input.client_request_id) throw new DbError('submissions.insert', ins.error);
    const existing = one('submissions.byRequest', await this.sb.from('submissions').select('*').eq('client_request_id', input.client_request_id).single<Submission>());
    return { submission: existing, created: false };
  }
  async getSubmission(id: string) {
    return maybe('submissions.get', await this.sb.from('submissions').select('*').eq('id', id).maybeSingle<Submission>());
  }
  async setSubmissionStatus(id: string, status: Submission['status']) {
    check('submissions.status', await this.sb.from('submissions').update({ status }).eq('id', id));
  }

  async createOrder(input: Parameters<Db['createOrder']>[0]) {
    const ins = await this.sb.from('orders').insert(input).select('*').single<Order>();
    if (!ins.error) return { order: ins.data, created: true };
    if (ins.error.code !== UNIQUE_VIOLATION) throw new DbError('orders.insert', ins.error);
    const existing = one('orders.bySubmissionProduct', await this.sb.from('orders').select('*').eq('submission_id', input.submission_id).eq('product', input.product).single<Order>());
    return { order: existing, created: false };
  }
  async getOrder(id: string) {
    return maybe('orders.get', await this.sb.from('orders').select('*').eq('id', id).maybeSingle<Order>());
  }
  async getOrdersBySubmission(submissionId: string) {
    const res = await this.sb.from('orders').select('*').eq('submission_id', submissionId);
    check('orders.bySubmission', res);
    return (res.data ?? []) as Order[];
  }
  async getOrderByCheckoutSession(sessionId: string) {
    return maybe('orders.bySession', await this.sb.from('orders').select('*').eq('stripe_checkout_session_id', sessionId).maybeSingle<Order>());
  }
  async attachCheckoutSession(orderId: string, sessionId: string, expiresAt: string) {
    check('orders.attachSession', await this.sb.from('orders').update({ stripe_checkout_session_id: sessionId, checkout_expires_at: expiresAt }).eq('id', orderId));
  }
  async markOrderPaid({ orderId, paymentIntentId, authorisedBy, paidAt, reportExpiresAt }: Parameters<Db['markOrderPaid']>[0]) {
    // Conditional update: only a pending order flips to paid. Zero rows means
    // someone else already did it (idempotent duplicate).
    const res = await this.sb
      .from('orders')
      .update({ status: 'paid', stripe_payment_intent_id: paymentIntentId, authorised_by: authorisedBy, paid_at: paidAt, report_expires_at: reportExpiresAt })
      .eq('id', orderId)
      .eq('status', 'pending_payment')
      .select('*')
      .maybeSingle<Order>();
    const updated = maybe('orders.markPaid', res);
    if (updated) return { applied: true, order: updated };
    const current = await this.getOrder(orderId);
    if (!current) throw new DbError('orders.markPaid', { message: 'order not found' });
    return { applied: false, order: current };
  }
  async authoriseOrder({ orderId, authorisedBy, now, reportExpiresAt }: Parameters<Db['authoriseOrder']>[0]) {
    const res = await this.sb
      .from('orders')
      .update({ status: 'authorised', authorised_by: authorisedBy, authorised_at: now, report_expires_at: reportExpiresAt })
      .eq('id', orderId)
      .eq('status', 'pending_payment')
      .eq('source', 'pilot')
      .select('*')
      .maybeSingle<Order>();
    const updated = maybe('orders.authorise', res);
    if (updated) return { applied: true, order: updated };
    const current = await this.getOrder(orderId);
    if (!current) throw new DbError('orders.authorise', { message: 'order not found' });
    return { applied: false, order: current };
  }
  async setOrderStatus(orderId: string, status: OrderStatus, extra?: { failed_reason?: string; fulfilled_at?: string }) {
    check('orders.status', await this.sb.from('orders').update({ status, ...(extra ?? {}) }).eq('id', orderId));
  }
  async findActiveOrdersByEmail(emailNormalised: string, now: string, limit: number) {
    const res = await this.sb
      .from('orders')
      .select('*')
      .eq('email_normalised', emailNormalised)
      .eq('product', 'standard')
      .in('status', ['authorised', 'paid', 'fulfilled'])
      .or(`report_expires_at.is.null,report_expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    check('orders.byEmail', res);
    return (res.data ?? []) as Order[];
  }
  async expireStaleCheckouts(now: string) {
    const res = await this.sb.from('orders').update({ status: 'expired' }).eq('status', 'pending_payment').lt('checkout_expires_at', now).select('id');
    check('orders.expire', res);
    return res.data?.length ?? 0;
  }

  async insertWebhookEvent(input: Parameters<Db['insertWebhookEvent']>[0]) {
    const ins = await this.sb.from('webhook_events').insert(input).select('*').single<WebhookEvent>();
    if (!ins.error) return { created: true, event: ins.data };
    if (ins.error.code !== UNIQUE_VIOLATION) throw new DbError('webhook_events.insert', ins.error);
    const existing = one('webhook_events.get', await this.sb.from('webhook_events').select('*').eq('provider', input.provider).eq('event_id', input.event_id).single<WebhookEvent>());
    return { created: false, event: existing };
  }
  async updateWebhookEvent(id: string, patch: { status: WebhookEventStatus; error?: string | null; order_id?: string | null; processed_at?: string | null }) {
    check('webhook_events.update', await this.sb.from('webhook_events').update(patch).eq('id', id));
  }

  async createJob(input: { order_id: string; type: string }) {
    const ins = await this.sb.from('jobs').insert(input).select('*').single<Job>();
    if (!ins.error) return { created: true, job: ins.data };
    if (ins.error.code !== UNIQUE_VIOLATION) throw new DbError('jobs.insert', ins.error);
    const job = one('jobs.get', await this.sb.from('jobs').select('*').eq('order_id', input.order_id).eq('type', input.type).single<Job>());
    return { created: false, job };
  }
  async getJob(id: string) {
    return maybe('jobs.get', await this.sb.from('jobs').select('*').eq('id', id).maybeSingle<Job>());
  }
  async getJobForOrder(orderId: string, type: string) {
    return maybe('jobs.forOrder', await this.sb.from('jobs').select('*').eq('order_id', orderId).eq('type', type).maybeSingle<Job>());
  }
  async claimJob(jobId: string, workerId: string, leaseSeconds: number) {
    const res = await this.sb.rpc('claim_job', { p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    check('jobs.claim', res);
    const rows = (res.data ?? []) as Job[];
    return rows[0] ?? null;
  }
  async extendLease(jobId: string, workerId: string, leaseSeconds: number) {
    const res = await this.sb.rpc('extend_job_lease', { p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    check('jobs.extendLease', res);
    return res.data === true;
  }
  async checkpointJob(jobId: string, workerId: string, stage: JobStage, checkpoint: Json) {
    const res = await this.sb.from('jobs').update({ stage, checkpoint }).eq('id', jobId).eq('lease_owner', workerId).eq('status', 'running').select('id');
    check('jobs.checkpoint', res);
    if (!res.data?.length) throw new DbError('jobs.checkpoint', { message: 'lease lost' });
  }
  async completeJob(jobId: string, workerId: string) {
    const res = await this.sb
      .from('jobs')
      .update({ status: 'succeeded', stage: 'done', finished_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null })
      .eq('id', jobId).eq('lease_owner', workerId).select('id');
    check('jobs.complete', res);
    if (!res.data?.length) throw new DbError('jobs.complete', { message: 'lease lost' });
  }
  async failJob(jobId: string, workerId: string, { error, retryAt }: { error: string; retryAt: string | null }) {
    const current = await this.getJob(jobId);
    if (!current || current.lease_owner !== workerId) throw new DbError('jobs.fail', { message: 'lease lost' });
    const dead = !retryAt || current.attempts >= current.max_attempts;
    const patch = dead
      ? { status: 'dead', last_error: error, lease_owner: null, lease_expires_at: null, finished_at: new Date().toISOString() }
      : { status: 'queued', last_error: error, lease_owner: null, lease_expires_at: null, run_after: retryAt };
    return one('jobs.fail', await this.sb.from('jobs').update(patch).eq('id', jobId).eq('lease_owner', workerId).select('*').single<Job>());
  }
  async findRunnableJobs(now: string, limit: number) {
    const res = await this.sb.from('jobs').select('*').eq('status', 'queued').lte('run_after', now).order('run_after', { ascending: true }).limit(limit);
    check('jobs.runnable', res);
    return ((res.data ?? []) as Job[]).filter((j) => j.attempts < j.max_attempts);
  }
  async recoverStalledJobs() {
    const res = await this.sb.rpc('recover_stalled_jobs');
    check('jobs.recover', res);
    return (res.data ?? []) as Job[];
  }

  async replaceResearchSources(orderId: string, sources: ResearchSource[]) {
    check('research_sources.delete', await this.sb.from('research_sources').delete().eq('order_id', orderId));
    if (!sources.length) return;
    const seen = new Set<string>();
    const rows = sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).map((s) => ({ ...s, order_id: orderId }));
    check('research_sources.insert', await this.sb.from('research_sources').insert(rows));
  }
  async getResearchSources(orderId: string) {
    const res = await this.sb.from('research_sources').select('url,title,publisher,page_age,snippet,published_date,geography,unit,period,claim_type').eq('order_id', orderId);
    check('research_sources.get', res);
    return (res.data ?? []) as ResearchSource[];
  }
  async upsertReport(orderId: string, patch: Partial<Omit<Report, 'id' | 'order_id'>>) {
    return one('reports.upsert', await this.sb.from('reports').upsert({ order_id: orderId, ...patch }, { onConflict: 'order_id' }).select('*').single<Report>());
  }
  async getReport(orderId: string) {
    return maybe('reports.get', await this.sb.from('reports').select('*').eq('order_id', orderId).maybeSingle<Report>());
  }
  async replaceReportClaims(reportId: string, claims: ReportClaim[]) {
    check('report_claims.delete', await this.sb.from('report_claims').delete().eq('report_id', reportId));
    if (!claims.length) return;
    check('report_claims.insert', await this.sb.from('report_claims').insert(claims.map((c) => ({ ...c, report_id: reportId }))));
  }

  async createAccessToken(input: Parameters<Db['createAccessToken']>[0]) {
    return one('access_tokens.insert', await this.sb.from('access_tokens').insert(input).select('*').single<AccessToken>());
  }
  async findAccessToken(tokenHash: string) {
    return maybe('access_tokens.find', await this.sb.from('access_tokens').select('*').eq('token_hash', tokenHash).maybeSingle<AccessToken>());
  }
  async revokeTokensForOrder(orderId: string, now: string) {
    const res = await this.sb.from('access_tokens').update({ revoked_at: now }).eq('order_id', orderId).is('revoked_at', null).select('id');
    check('access_tokens.revoke', res);
    return res.data?.length ?? 0;
  }
  async touchAccessToken(id: string, now: string) {
    // Best effort; not transactional. use_count is informational only.
    const cur = maybe('access_tokens.get', await this.sb.from('access_tokens').select('use_count').eq('id', id).maybeSingle<{ use_count: number }>());
    check('access_tokens.touch', await this.sb.from('access_tokens').update({ last_used_at: now, use_count: (cur?.use_count ?? 0) + 1 }).eq('id', id));
  }

  async recordDelivery(input: Omit<DeliveryAttempt, 'id' | 'created_at'>) {
    check('delivery_attempts.insert', await this.sb.from('delivery_attempts').insert(input));
  }
  async hasDelivery(orderId: string, kind: DeliveryKind) {
    const res = await this.sb.from('delivery_attempts').select('id').eq('order_id', orderId).eq('kind', kind).eq('status', 'sent').limit(1);
    check('delivery_attempts.has', res);
    return (res.data?.length ?? 0) > 0;
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number) {
    const res = await this.sb.rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    check('rate_limits.consume', res);
    const row = (res.data as { allowed: boolean; remaining: number }[] | null)?.[0];
    // Fail closed: if the limiter is unavailable, deny.
    return row ?? { allowed: false, remaining: 0 };
  }
  async pruneRateLimits() {
    const res = await this.sb.rpc('prune_rate_limits');
    check('rate_limits.prune', res);
    return Number(res.data ?? 0);
  }
}

export class SupabaseBlobStore implements BlobStore {
  constructor(private sb: SupabaseClient, private bucket = 'reports') {}

  async putPdf(path: string, bytes: Buffer) {
    const { error } = await this.sb.storage.from(this.bucket).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (error) throw new DbError('storage.upload', { message: error.message });
  }
  async getPdf(path: string) {
    const { data, error } = await this.sb.storage.from(this.bucket).download(path);
    if (error || !data) throw new DbError('storage.download', { message: error?.message ?? 'no data' });
    return Buffer.from(await data.arrayBuffer());
  }
  async createSignedUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.sb.storage.from(this.bucket).createSignedUrl(path, expiresInSeconds, { download: 'inovantage-feasibility-report.pdf' });
    if (error || !data?.signedUrl) throw new DbError('storage.sign', { message: error?.message ?? 'no url' });
    return data.signedUrl;
  }
}
