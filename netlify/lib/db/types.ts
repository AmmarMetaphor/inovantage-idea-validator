/*
  Domain types and the persistence interface.

  Two implementations exist: SupabaseDb (production, service role only) and
  MemoryDb (tests). Handlers and the job runner depend on this interface only,
  which is what makes the security tests runnable without a database.
*/

export type Json = Record<string, unknown>;

export interface Submission {
  id: string;
  created_at: string;
  email: string;
  email_normalised: string;
  market: 'UK' | 'US' | 'AU';
  currency: 'GBP' | 'USD' | 'AUD';
  idea_name: string;
  answers: Json;
  status: 'draft' | 'ordered' | 'paid' | 'expired';
  source: 'public' | 'pilot';
  client_request_id: string | null;
}

export type OrderStatus = 'pending_payment' | 'paid' | 'fulfilled' | 'failed' | 'expired' | 'refunded';

export type OrderSource = 'stripe' | 'pilot';
export type AuthorisedBy = 'stripe_webhook' | 'checkout_return' | 'owner_pilot';

export interface Order {
  id: string;
  created_at: string;
  submission_id: string;
  source: OrderSource;
  authorised_by: AuthorisedBy | null;
  email: string;
  email_normalised: string;
  status: OrderStatus;
  amount_minor: number;
  currency: string;
  stripe_price_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  checkout_expires_at: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  failed_reason: string | null;
  report_expires_at: string | null;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
export type JobStage = 'confirm' | 'research' | 'compose' | 'render' | 'deliver' | 'done';
export const JOB_STAGES: JobStage[] = ['confirm', 'research', 'compose', 'render', 'deliver', 'done'];

export interface Job {
  id: string;
  created_at: string;
  order_id: string;
  type: string;
  status: JobStatus;
  stage: JobStage;
  checkpoint: Json;
  attempts: number;
  max_attempts: number;
  run_after: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
}

export interface ResearchSource {
  url: string;
  title: string | null;
  publisher: string | null;
  page_age: string | null;
  snippet: string | null;
}

export interface ReportClaim {
  section_id: string;
  position: number;
  claim_text: string;
  kind: 'evidence' | 'assumption' | 'customer_input' | 'calculation';
  confidence: 'high' | 'medium' | 'low';
  source_urls: string[];
}

export type ReportStatus = 'generating' | 'generated' | 'rendered' | 'delivered' | 'failed';

export interface Report {
  id: string;
  order_id: string;
  version: number;
  status: ReportStatus;
  content: Json | null;
  verdict: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  generated_at: string | null;
  pdf_object_path: string | null;
  pdf_bytes: number | null;
  rendered_at: string | null;
  delivered_at: string | null;
}

export interface AccessToken {
  id: string;
  order_id: string;
  token_hash: string;
  purpose: 'report_access';
  issued_via: 'checkout_return' | 'email' | 'recovery' | 'pilot';
  expires_at: string;
  revoked_at: string | null;
  use_count: number;
}

export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'ignored' | 'rejected' | 'failed';

export interface WebhookEvent {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload_hash: string;
  status: WebhookEventStatus;
  received_at: string;
  processed_at: string | null;
  order_id: string | null;
  error: string | null;
}

export type DeliveryKind = 'confirmation' | 'report' | 'recovery' | 'owner_alert';

export interface DeliveryAttempt {
  id: string;
  order_id: string;
  job_id: string | null;
  kind: DeliveryKind;
  provider: string;
  provider_message_id: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

export interface Db {
  // submissions
  /** Idempotent on client_request_id: a repeat returns the existing row with created=false. */
  createSubmission(input: Omit<Submission, 'id' | 'created_at' | 'status'> & { ip_hash?: string; user_agent_hash?: string }): Promise<{ submission: Submission; created: boolean }>;
  getSubmission(id: string): Promise<Submission | null>;
  setSubmissionStatus(id: string, status: Submission['status']): Promise<void>;

  // orders
  /** Unique per submission: a repeat returns the existing order with created=false. */
  createOrder(input: { submission_id: string; email: string; email_normalised: string; amount_minor: number; currency: string; stripe_price_id: string | null; source: OrderSource }): Promise<{ order: Order; created: boolean }>;
  getOrder(id: string): Promise<Order | null>;
  getOrderBySubmission(submissionId: string): Promise<Order | null>;
  getOrderByCheckoutSession(sessionId: string): Promise<Order | null>;
  attachCheckoutSession(orderId: string, sessionId: string, expiresAt: string): Promise<void>;
  /** Idempotent. Returns applied=false when the order was already paid/authorised. Throws on payment-intent conflict. */
  markOrderPaid(input: { orderId: string; paymentIntentId: string | null; authorisedBy: AuthorisedBy; paidAt: string; reportExpiresAt: string }): Promise<{ applied: boolean; order: Order }>;
  setOrderStatus(orderId: string, status: OrderStatus, extra?: { failed_reason?: string; fulfilled_at?: string }): Promise<void>;
  /** Paid/fulfilled, unexpired orders for an email (newest first). */
  findActiveOrdersByEmail(emailNormalised: string, now: string, limit: number): Promise<Order[]>;
  expireStaleCheckouts(now: string): Promise<number>;

  // webhook ledger
  insertWebhookEvent(input: { provider: string; event_id: string; event_type: string; payload_hash: string }): Promise<{ created: boolean; event: WebhookEvent }>;
  updateWebhookEvent(id: string, patch: { status: WebhookEventStatus; error?: string | null; order_id?: string | null; processed_at?: string | null }): Promise<void>;

  // jobs
  createJob(input: { order_id: string; type: string }): Promise<{ created: boolean; job: Job }>;
  getJob(id: string): Promise<Job | null>;
  getJobForOrder(orderId: string, type: string): Promise<Job | null>;
  claimJob(jobId: string, workerId: string, leaseSeconds: number): Promise<Job | null>;
  extendLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  checkpointJob(jobId: string, workerId: string, stage: JobStage, checkpoint: Json): Promise<void>;
  completeJob(jobId: string, workerId: string): Promise<void>;
  failJob(jobId: string, workerId: string, input: { error: string; retryAt: string | null }): Promise<Job>;
  findRunnableJobs(now: string, limit: number): Promise<Job[]>;
  recoverStalledJobs(): Promise<Job[]>;

  // research & reports
  replaceResearchSources(orderId: string, sources: ResearchSource[]): Promise<void>;
  getResearchSources(orderId: string): Promise<ResearchSource[]>;
  upsertReport(orderId: string, patch: Partial<Omit<Report, 'id' | 'order_id'>>): Promise<Report>;
  getReport(orderId: string): Promise<Report | null>;
  replaceReportClaims(reportId: string, claims: ReportClaim[]): Promise<void>;

  // access tokens
  createAccessToken(input: { order_id: string; token_hash: string; issued_via: AccessToken['issued_via']; expires_at: string }): Promise<AccessToken>;
  findAccessToken(tokenHash: string): Promise<AccessToken | null>;
  touchAccessToken(id: string, now: string): Promise<void>;

  // deliveries
  recordDelivery(input: Omit<DeliveryAttempt, 'id' | 'created_at'>): Promise<void>;
  hasDelivery(orderId: string, kind: DeliveryKind): Promise<boolean>;

  // rate limits
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>;
  pruneRateLimits(): Promise<number>;
}

/** Binary object storage (PDFs). Private bucket; reads only via signed URLs. */
export interface BlobStore {
  putPdf(path: string, bytes: Buffer): Promise<void>;
  getPdf(path: string): Promise<Buffer>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}
