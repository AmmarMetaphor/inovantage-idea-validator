/*
  Job runner: claims a job under a lease, runs the stages in order, and
  checkpoints after each one. Every stage is idempotent and checks the
  database before doing work, so a retry after a crash (or a worker whose
  lease expired mid-stage) resumes without repeating finished stages.

  Stages:
    confirm  → order-confirmation email with status link
    research → gather sources (research_sources)
    compose  → write the structured report (reports.content, report_claims)
    render   → PDF to private storage (reports.pdf_object_path)
    deliver  → report email with PDF attached
    done
*/
import { MARKETS } from '../../src/config/product';
import type { Answers } from '../../src/questionnaire/types';
import { shortRef } from './crypto';
import type { BlobStore, Db, Job, JobStage, Json, Order } from './db/types';
import { confirmationEmail, ownerAlertEmail, reportReadyEmail } from './emails';
import type { Logger } from './log';
import type { Mailer } from './mailer';
import { renderReportPdf } from './pdf';
import { ReportContentSchema, type ReportContent } from './report-schema';
import { buildBrief, NonRetryableGenerationError, type ReportGenerator } from './research';
import { mintAccessToken } from './tokens';

export interface JobDeps {
  db: Db;
  blobs: BlobStore;
  mailer: Mailer;
  generator: ReportGenerator;
  renderPdf?: typeof renderReportPdf;
  log: Logger;
  now: () => Date;
  appUrl: string;
  tokenTtlDays: number;
  ownerAlertEmail?: string;
  leaseSeconds?: number;
  heartbeatMs?: number;
}

export const DEFAULT_LEASE_SECONDS = 600;
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

export type RunOutcome =
  | { status: 'not_claimed' }
  | { status: 'succeeded'; job: Job }
  | { status: 'retry_scheduled'; job: Job; error: string }
  | { status: 'dead'; job: Job; error: string };

const ORDER: JobStage[] = ['confirm', 'research', 'compose', 'render', 'deliver', 'done'];

function nextStage(stage: JobStage): JobStage {
  return ORDER[Math.min(ORDER.indexOf(stage) + 1, ORDER.length - 1)];
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

  // Heartbeat keeps the lease alive while long stages run.
  const heartbeat = setInterval(() => {
    db.extendLease(job.id, workerId, lease).then((ok) => {
      if (!ok) jlog.warn('job.lease_lost');
    }, (err) => jlog.warn('job.heartbeat_failed', { err }));
  }, deps.heartbeatMs ?? 60_000);

  try {
    const order = await db.getOrder(job.order_id);
    if (!order) throw new NonRetryableGenerationError('order missing');
    if (order.status !== 'paid' && order.status !== 'fulfilled') {
      throw new NonRetryableGenerationError(`order is ${order.status}, refusing to generate`);
    }
    let stage = job.stage;
    let checkpoint = job.checkpoint;
    while (stage !== 'done') {
      jlog.info('job.stage_start', { stage });
      checkpoint = await runStage(deps, { job, order, stage, checkpoint, workerId, log: jlog });
      stage = nextStage(stage);
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

interface StageCtx {
  job: Job;
  order: Order;
  stage: JobStage;
  checkpoint: Json;
  workerId: string;
  log: Logger;
}

async function runStage(deps: JobDeps, ctx: StageCtx): Promise<Json> {
  const { db } = deps;
  const { order, stage, checkpoint } = ctx;
  const ref = shortRef(order.id);

  switch (stage) {
    case 'confirm': {
      if (await db.hasDelivery(order.id, 'confirmation')) return checkpoint;
      const sub = await db.getSubmission(order.submission_id);
      const link = await mintAccessToken(db, { orderId: order.id, issuedVia: 'email', ttlDays: deps.tokenTtlDays, now: deps.now(), appUrl: deps.appUrl, notAfter: order.report_expires_at });
      const mail = confirmationEmail({ statusUrl: link.statusUrl, orderRef: ref, ideaName: sub?.idea_name ?? 'your idea' });
      await sendTracked(deps, ctx, 'confirmation', { to: order.email, ...mail });
      return checkpoint;
    }
    case 'research': {
      if (checkpoint.research_done === true) return checkpoint;
      const sub = await db.getSubmission(order.submission_id);
      if (!sub) throw new NonRetryableGenerationError('submission missing');
      const brief = buildBrief({ orderRef: ref, market: sub.market, currency: sub.currency, ideaName: sub.idea_name, answers: sub.answers as Answers });
      await db.upsertReport(order.id, { status: 'generating' });
      const out = await deps.generator.research(brief);
      await db.replaceResearchSources(order.id, out.sources);
      return { ...checkpoint, research_done: true, research_notes: out.notes.slice(0, 20000), research_usage: out.usage };
    }
    case 'compose': {
      const existing = await db.getReport(order.id);
      if (existing?.content && existing.status !== 'generating') return checkpoint;
      const sub = await db.getSubmission(order.submission_id);
      if (!sub) throw new NonRetryableGenerationError('submission missing');
      const brief = buildBrief({ orderRef: ref, market: sub.market, currency: sub.currency, ideaName: sub.idea_name, answers: sub.answers as Answers });
      const sources = await db.getResearchSources(order.id);
      const out = await deps.generator.compose(brief, sources, String(checkpoint.research_notes ?? ''));
      const report = await db.upsertReport(order.id, {
        status: 'generated',
        content: out.report as unknown as Json,
        verdict: out.report.verdict.label,
        model: out.model,
        input_tokens: out.usage.input_tokens + Number((checkpoint.research_usage as { input_tokens?: number } | undefined)?.input_tokens ?? 0),
        output_tokens: out.usage.output_tokens + Number((checkpoint.research_usage as { output_tokens?: number } | undefined)?.output_tokens ?? 0),
        generated_at: deps.now().toISOString(),
      });
      await db.replaceReportClaims(
        report.id,
        out.report.claims.map((c, i) => ({ section_id: c.section_id, position: i, claim_text: c.text, kind: c.kind, confidence: c.confidence, source_urls: c.source_urls })),
      );
      return checkpoint;
    }
    case 'render': {
      const report = await db.getReport(order.id);
      if (!report?.content) throw new Error('report content missing before render');
      if (report.pdf_object_path) return checkpoint;
      const sub = await db.getSubmission(order.submission_id);
      const content = ReportContentSchema.parse(report.content) as ReportContent;
      const render = deps.renderPdf ?? renderReportPdf;
      const pdf = await render(content, {
        orderRef: ref,
        marketLabel: MARKETS.find((m) => m.code === sub?.market)?.label ?? sub?.market ?? '',
        generatedAt: deps.now(),
        generatorName: deps.generator.name,
      });
      const path = `orders/${order.id}/report-v${report.version}.pdf`;
      await deps.blobs.putPdf(path, pdf);
      await db.upsertReport(order.id, { status: 'rendered', pdf_object_path: path, pdf_bytes: pdf.length, rendered_at: deps.now().toISOString() });
      return { ...checkpoint, pdf_path: path };
    }
    case 'deliver': {
      if (await db.hasDelivery(order.id, 'report')) return checkpoint;
      const report = await db.getReport(order.id);
      if (!report?.pdf_object_path) throw new Error('pdf missing before deliver');
      const sub = await db.getSubmission(order.submission_id);
      const link = await mintAccessToken(db, { orderId: order.id, issuedVia: 'email', ttlDays: deps.tokenTtlDays, now: deps.now(), appUrl: deps.appUrl, notAfter: order.report_expires_at });
      const pdfBytes = await deps.blobs.getPdf(report.pdf_object_path);
      const mail = reportReadyEmail({
        statusUrl: link.statusUrl,
        orderRef: ref,
        ideaName: sub?.idea_name ?? 'your idea',
        verdict: report.verdict ?? 'See report',
        expiresOn: (order.report_expires_at ?? link.record.expires_at).slice(0, 10),
      });
      await sendTracked(deps, ctx, 'report', { to: order.email, ...mail, attachments: [{ filename: `inovantage-feasibility-report-${ref}.pdf`, content: pdfBytes }] });
      await db.upsertReport(order.id, { status: 'delivered', delivered_at: deps.now().toISOString() });
      return checkpoint;
    }
    case 'done':
      return checkpoint;
  }
}

async function sendTracked(deps: JobDeps, ctx: StageCtx, kind: 'confirmation' | 'report', message: Parameters<Mailer['send']>[0]) {
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
    await deps.mailer.send({ to: deps.ownerAlertEmail, ...ownerAlertEmail({ orderRef: shortRef(job.order_id), jobId: job.id, error }) });
  } catch (err) {
    deps.log.warn('job.owner_alert_failed', { err });
  }
}
