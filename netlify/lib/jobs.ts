/*
  Job runner: claims a job under a lease, runs the stages in order, and
  checkpoints after each one. Every stage is idempotent and checks the
  database before doing work, so a retry after a crash (or a worker whose
  lease expired mid-stage) resumes without repeating finished stages.

  Stages (both products):
    confirm  → order-confirmation email with the private report link
    research → gather sources (research_sources); the upgrade reuses the
               standard order's sources and adds a deeper pass
    compose  → structured report (reports.content, report_claims)
    render   → PDF to private storage; the standard report must be exactly
               two pages, otherwise compose is re-run with a tighten hint
    deliver  → report email with PDF attached and the web link
    done
*/
import { MARKETS } from '../../src/config/product';
import type { Answers } from '../../src/questionnaire/types';
import { shortRef } from './crypto';
import { FULFILLABLE, type BlobStore, type Db, type Job, type JobStage, type Json, type Order } from './db/types';
import { confirmationEmail, ownerAlertEmail, reportReadyEmail } from './emails';
import type { Logger } from './log';
import type { Mailer } from './mailer';
import { renderDetailedPdf, renderStandardPdf, type PdfMeta } from './pdf';
import { DetailedReportSchema, StandardReportSchema, type StandardReport } from './report-schema';
import { buildInfo } from './env';
import { buildBrief, GenerationRequestError, NonRetryableGenerationError, type ReportGenerator } from './research';
import { mintAccessToken } from './tokens';

export interface JobDeps {
  db: Db;
  blobs: BlobStore;
  mailer: Mailer;
  generator: ReportGenerator;
  renderStandard?: typeof renderStandardPdf;
  renderDetailed?: typeof renderDetailedPdf;
  log: Logger;
  now: () => Date;
  appUrl: string;
  tokenTtlDays: number;
  ownerAlertEmail?: string;
  /** Pilot orders may only be delivered to these normalised addresses. */
  pilotAllowedEmails: string[];
  leaseSeconds?: number;
  heartbeatMs?: number;
}

export const DEFAULT_LEASE_SECONDS = 600;
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const MAX_TIGHTEN = 2;

export type RunOutcome =
  | { status: 'not_claimed' }
  | { status: 'succeeded'; job: Job }
  | { status: 'retry_scheduled'; job: Job; error: string }
  | { status: 'dead'; job: Job; error: string };

const ORDER: JobStage[] = ['confirm', 'research', 'compose', 'render', 'deliver', 'done'];

function nextStage(stage: JobStage): JobStage {
  return ORDER[Math.min(ORDER.indexOf(stage) + 1, ORDER.length - 1)];
}

/** Thrown when a pilot order would be delivered outside the allowlist. */
export class PilotDeliveryBlocked extends NonRetryableGenerationError {
  constructor() {
    super('pilot order delivery address is not on the allowlist');
    this.name = 'PilotDeliveryBlocked';
  }
}

/** Thrown by render when the standard PDF is not exactly two pages. */
export class ReportTooLong extends Error {
  constructor(public pages: number) {
    super(`standard report rendered to ${pages} pages`);
    this.name = 'ReportTooLong';
  }
}

export function assertPilotDeliveryAllowed(order: Pick<Order, 'source' | 'email'>, to: string, allowlist: string[]): void {
  if (order.source !== 'pilot') return;
  const target = to.trim().toLowerCase();
  if (!allowlist.includes(target) || target !== order.email.trim().toLowerCase()) throw new PilotDeliveryBlocked();
}

export async function runJob(deps: JobDeps, jobId: string, workerId: string): Promise<RunOutcome> {
  const { db, log } = deps;
  const lease = deps.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const job = await db.claimJob(jobId, workerId, lease);
  if (!job) {
    log.info('job.not_claimed', { job_id: jobId });
    return { status: 'not_claimed' };
  }
  const jlog = log.child({ job_id: job.id, order_id: job.order_id, attempt: job.attempts });
  jlog.info('job.claimed', { stage: job.stage });

  const heartbeat = setInterval(() => {
    db.extendLease(job.id, workerId, lease).then((ok) => {
      if (!ok) jlog.warn('job.lease_lost');
    }, (err) => jlog.warn('job.heartbeat_failed', { err }));
  }, deps.heartbeatMs ?? 60_000);

  try {
    const order = await db.getOrder(job.order_id);
    if (!order) throw new NonRetryableGenerationError('order missing');
    if (!FULFILLABLE.includes(order.status)) {
      throw new NonRetryableGenerationError(`order is ${order.status}, refusing to generate`);
    }
    if (order.status === 'authorised' && order.source !== 'pilot') {
      throw new NonRetryableGenerationError('authorised status is only valid for pilot orders');
    }
    let stage = job.stage;
    let checkpoint = job.checkpoint;
    while (stage !== 'done') {
      jlog.info('job.stage_start', { stage, product: order.product });
      const startedAt = Date.now();
      try {
        checkpoint = await runStage(deps, { job, order, stage, checkpoint, workerId, log: jlog });
        checkpoint = withTiming(checkpoint, stage, Date.now() - startedAt);
        jlog.info('job.stage_timing', { stage, ms: Date.now() - startedAt });
        stage = nextStage(stage);
      } catch (err) {
        checkpoint = withTiming(checkpoint, stage, Date.now() - startedAt, true);
        if (err instanceof GenerationRequestError) {
          // The API rejected the request itself; an unchanged retry cannot
          // succeed. Keep the research checkpoint, record a sanitised
          // diagnostic where the owner can see it, and mark the report failed.
          checkpoint = { ...checkpoint, api_error: { ...err.diagnostic, build: buildInfo() } as unknown as Json };
          await db.checkpointJob(job.id, workerId, stage, checkpoint).catch((inner) => jlog.warn('job.checkpoint_failed', { err: inner }));
          await db.upsertReport(order.id, { status: 'failed', content: null }).catch((inner) => jlog.warn('job.report_fail_mark_failed', { err: inner }));
          jlog.error('job.request_rejected', { stage, diagnostic: err.diagnostic });
          throw err;
        }
        if (err instanceof ReportTooLong) {
          const tighten = Number(checkpoint.tighten ?? 0) + 1;
          if (tighten > MAX_TIGHTEN) throw new NonRetryableGenerationError(`standard report still ${err.pages} pages after ${MAX_TIGHTEN} tighten passes`);
          jlog.warn('job.report_too_long', { pages: err.pages, tighten });
          await db.upsertReport(order.id, { status: 'generating', content: null });
          checkpoint = { ...checkpoint, tighten };
          stage = 'compose';
        } else {
          throw err;
        }
      }
      await db.checkpointJob(job.id, workerId, stage, checkpoint);
      jlog.info('job.stage_done', { stage });
    }
    await db.completeJob(job.id, workerId);
    await db.setOrderStatus(order.id, 'fulfilled', { fulfilled_at: deps.now().toISOString() });
    const final = (await db.getJob(job.id))!;
    jlog.info('job.succeeded');
    return { status: 'succeeded', job: final };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const nonRetryable = err instanceof NonRetryableGenerationError;
    const exhausted = job.attempts >= job.max_attempts;
    const retryAt = nonRetryable || exhausted ? null : new Date(deps.now().getTime() + BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)] * 60_000).toISOString();
    jlog.error('job.failed', { err, retry_at: retryAt, non_retryable: nonRetryable });
    let updated: Job;
    try {
      updated = await db.failJob(job.id, workerId, { error: message.slice(0, 1000), retryAt });
    } catch (inner) {
      jlog.error('job.fail_record_failed', { err: inner });
      const current = await db.getJob(job.id);
      return { status: 'dead', job: current ?? job, error: message };
    }
    if (updated.status === 'dead') {
      await db.setOrderStatus(job.order_id, 'failed', { failed_reason: 'report generation failed' });
      await alertOwner(deps, job, message);
      return { status: 'dead', job: updated, error: message };
    }
    return { status: 'retry_scheduled', job: updated, error: message };
  } finally {
    clearInterval(heartbeat);
  }
}

function summariseMapping(m: { truncated: string[]; droppedSourceIds: number[]; downgradedClaims: number; normalised: string[] }) {
  return { truncated: m.truncated.length, dropped_source_ids: m.droppedSourceIds.length, downgraded_claims: m.downgradedClaims, normalised: m.normalised.length };
}

/** Cumulative wall-clock per stage, kept in the checkpoint for owner timing evidence. */
function withTiming(checkpoint: Json, stage: JobStage, ms: number, failed = false): Json {
  const timings = (checkpoint.timings && typeof checkpoint.timings === 'object' && !Array.isArray(checkpoint.timings) ? checkpoint.timings : {}) as Record<string, Json>;
  const prev = (timings[stage] && typeof timings[stage] === 'object' && !Array.isArray(timings[stage]) ? timings[stage] : {}) as Record<string, Json>;
  return {
    ...checkpoint,
    timings: {
      ...timings,
      [stage]: { ms: Number(prev.ms ?? 0) + ms, runs: Number(prev.runs ?? 0) + 1, ...(failed ? { failed_runs: Number(prev.failed_runs ?? 0) + 1 } : prev.failed_runs ? { failed_runs: prev.failed_runs } : {}), last_ms: ms },
    },
  };
}

interface StageCtx {
  job: Job;
  order: Order;
  stage: JobStage;
  checkpoint: Json;
  workerId: string;
  log: Logger;
}

async function briefFor(deps: JobDeps, order: Order, ref: string) {
  const sub = await deps.db.getSubmission(order.submission_id);
  if (!sub) throw new NonRetryableGenerationError('submission missing');
  const answers = sub.answers as Answers;
  const version = (sub as { answers_version?: number }).answers_version ?? (answers.ideaDescription !== undefined ? 2 : 1);
  return { sub, brief: buildBrief({ orderRef: ref, market: sub.market, currency: sub.currency, ideaName: sub.idea_name, answers, answersVersion: version }) };
}

async function runStage(deps: JobDeps, ctx: StageCtx): Promise<Json> {
  const { db } = deps;
  const { order, stage, checkpoint } = ctx;
  const ref = shortRef(order.id);
  const tier = order.product === 'upgrade' ? 'detailed' : 'standard';
  const deliveryKind = tier === 'detailed' ? 'detailed_report' : 'report';

  switch (stage) {
    case 'confirm': {
      if (await db.hasDelivery(order.id, 'confirmation')) return checkpoint;
      const sub = await db.getSubmission(order.submission_id);
      // Email-delivered links are the customer's ongoing access: no expiry.
      const link = await mintAccessToken(db, { orderId: order.id, issuedVia: 'email', ttlDays: 0, now: deps.now(), appUrl: deps.appUrl, notAfter: order.report_expires_at });
      const mail = confirmationEmail({ statusUrl: link.statusUrl, orderRef: ref, ideaName: sub?.idea_name ?? 'your idea', product: order.product });
      await sendTracked(deps, ctx, 'confirmation', { to: order.email, ...mail });
      return checkpoint;
    }
    case 'research': {
      if (checkpoint.research_done === true) return checkpoint;
      const { brief } = await briefFor(deps, order, ref);
      await db.upsertReport(order.id, { status: 'generating', tier });
      // Upgrade: start from the standard order's sources, then add a deeper pass.
      const seed = order.product === 'upgrade' && order.parent_order_id ? await db.getResearchSources(order.parent_order_id) : [];
      const out = await deps.generator.research(brief, tier);
      const seen = new Set<string>();
      const merged = [...out.sources, ...seed].filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
      await db.replaceResearchSources(order.id, merged);
      return { ...checkpoint, research_done: true, research_notes: out.notes.slice(0, 20000), research_retrieved_at: out.retrievedAt, research_usage: out.usage };
    }
    case 'compose': {
      const existing = await db.getReport(order.id);
      if (existing?.content && existing.status !== 'generating') return checkpoint;
      const { brief } = await briefFor(deps, order, ref);
      const sources = await db.getResearchSources(order.id);
      const notes = String(checkpoint.research_notes ?? '');
      const researchUsage = (checkpoint.research_usage as { input_tokens?: number; output_tokens?: number } | undefined) ?? {};
      let content: Json;
      let verdict: string | null = null;
      let model: string;
      let usage: { input_tokens: number; output_tokens: number };
      let claims: { section_id: string; text: string; kind: 'evidence' | 'assumption' | 'customer_input' | 'calculation'; confidence: 'high' | 'medium' | 'low'; source_indexes: number[] }[];
      let fallbacks: string[] = [];
      if (tier === 'detailed') {
        let standard: StandardReport | null = null;
        if (order.parent_order_id) {
          const parent = await db.getReport(order.parent_order_id);
          const parsed = parent?.content ? StandardReportSchema.safeParse(parent.content) : null;
          standard = parsed?.success ? parsed.data : null;
        }
        const out = await deps.generator.composeDetailed(brief, sources, notes, standard);
        if (out.mapping) ctx.log.info('compose.mapping', { tier, ...summariseMapping(out.mapping) });
        fallbacks = out.fallbacks ?? [];
        content = out.report as unknown as Json;
        model = out.model;
        usage = out.usage;
        claims = out.report.claims;
      } else {
        const out = await deps.generator.composeStandard(brief, sources, notes, { tighten: Number(checkpoint.tighten ?? 0) });
        if (out.mapping) ctx.log.info('compose.mapping', { tier, ...summariseMapping(out.mapping) });
        fallbacks = out.fallbacks ?? [];
        content = out.report as unknown as Json;
        verdict = out.report.verdict.label;
        model = out.model;
        usage = out.usage;
        claims = out.report.claims;
      }
      const report = await db.upsertReport(order.id, {
        status: 'generated',
        tier,
        schema_version: 2,
        content,
        verdict,
        model,
        input_tokens: usage.input_tokens + Number(researchUsage.input_tokens ?? 0),
        output_tokens: usage.output_tokens + Number(researchUsage.output_tokens ?? 0),
        generated_at: deps.now().toISOString(),
      });
      const srcByIndex = (i: number) => sources[i - 1]?.url;
      await db.replaceReportClaims(
        report.id,
        claims.map((c, i) => ({ section_id: c.section_id, position: i, claim_text: c.text, kind: c.kind, confidence: c.confidence, source_urls: c.source_indexes.map(srcByIndex).filter((u): u is string => !!u) })),
      );
      // A part generated without a grammar is a signal the owner should see
      // (the schema was still rejected as too large); the output was validated.
      if (fallbacks.length) ctx.log.warn('compose.grammar_fallback', { tier, parts: fallbacks });
      return fallbacks.length ? { ...checkpoint, compose_fallbacks: fallbacks } : checkpoint;
    }
    case 'render': {
      const report = await db.getReport(order.id);
      if (!report?.content) throw new Error('report content missing before render');
      if (report.pdf_object_path) return checkpoint;
      const sub = await db.getSubmission(order.submission_id);
      const meta: PdfMeta = {
        orderRef: ref,
        marketLabel: MARKETS.find((m) => m.code === sub?.market)?.label ?? sub?.market ?? '',
        generatedAt: deps.now(),
        generatorName: deps.generator.name,
        reportUrl: typeof checkpoint.report_url === 'string' ? checkpoint.report_url : undefined,
      };
      let pdf: Buffer;
      let pageCount: number;
      if (tier === 'detailed') {
        const content = DetailedReportSchema.parse(report.content);
        ({ pdf, pageCount } = await (deps.renderDetailed ?? renderDetailedPdf)(content, meta));
      } else {
        const content = StandardReportSchema.parse(report.content);
        ({ pdf, pageCount } = await (deps.renderStandard ?? renderStandardPdf)(content, meta));
        if (pageCount !== 2) throw new ReportTooLong(pageCount);
      }
      const version = report.version + Number(checkpoint.tighten ?? 0);
      const path = `orders/${order.id}/${tier}-v${version}.pdf`;
      await deps.blobs.putPdf(path, pdf);
      await db.upsertReport(order.id, { status: 'rendered', pdf_object_path: path, pdf_bytes: pdf.length, page_count: pageCount, rendered_at: deps.now().toISOString() });
      return { ...checkpoint, pdf_path: path };
    }
    case 'deliver': {
      if (await db.hasDelivery(order.id, deliveryKind)) return checkpoint;
      const report = await db.getReport(order.id);
      if (!report?.pdf_object_path) throw new Error('pdf missing before deliver');
      const sub = await db.getSubmission(order.submission_id);
      const link = await mintAccessToken(db, { orderId: order.id, issuedVia: 'email', ttlDays: 0, now: deps.now(), appUrl: deps.appUrl, notAfter: order.report_expires_at });
      const pdfBytes = await deps.blobs.getPdf(report.pdf_object_path);
      const mail = reportReadyEmail({ statusUrl: link.statusUrl, orderRef: ref, ideaName: sub?.idea_name ?? 'your idea', verdict: report.verdict ?? 'See report', tier });
      await sendTracked(deps, ctx, deliveryKind, { to: order.email, ...mail, attachments: [{ filename: `inovantage-${tier}-report-${ref}.pdf`, content: pdfBytes }] });
      await db.upsertReport(order.id, { status: 'delivered', delivered_at: deps.now().toISOString() });
      return checkpoint;
    }
    case 'done':
      return checkpoint;
  }
}

async function sendTracked(deps: JobDeps, ctx: StageCtx, kind: 'confirmation' | 'report' | 'detailed_report', message: Parameters<Mailer['send']>[0]) {
  // Server-side guarantee: a pilot order can only ever reach the allowlist.
  assertPilotDeliveryAllowed(ctx.order, message.to, deps.pilotAllowedEmails);
  try {
    const { providerMessageId } = await deps.mailer.send(message);
    await deps.db.recordDelivery({ order_id: ctx.order.id, job_id: ctx.job.id, kind, provider: 'resend', provider_message_id: providerMessageId, status: 'sent', error: null });
  } catch (err) {
    await deps.db.recordDelivery({ order_id: ctx.order.id, job_id: ctx.job.id, kind, provider: 'resend', provider_message_id: null, status: 'failed', error: err instanceof Error ? err.message.slice(0, 500) : String(err) });
    throw err;
  }
}

async function alertOwner(deps: JobDeps, job: Job, error: string) {
  if (!deps.ownerAlertEmail) return;
  try {
    const { providerMessageId } = await deps.mailer.send({ to: deps.ownerAlertEmail, ...ownerAlertEmail({ orderRef: shortRef(job.order_id), jobId: job.id, error }) });
    await deps.db.recordDelivery({ order_id: job.order_id, job_id: job.id, kind: 'owner_alert', provider: 'resend', provider_message_id: providerMessageId, status: 'sent', error: null });
  } catch (err) {
    deps.log.warn('job.owner_alert_failed', { err });
  }
}
