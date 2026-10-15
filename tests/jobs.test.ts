import { describe, expect, it } from 'vitest';
import { runJob } from '../netlify/lib/jobs';
import { dispatchJobs, reportWorker } from './api';
import { createPendingOrder, deliverWebhook, makeHarness, post, WORKER_SECRET, type Harness } from './helpers';

async function paidJob(h: Harness) {
  const { sessionId, order } = await createPendingOrder(h);
  h.gateway.pay(sessionId);
  await deliverWebhook(h, sessionId);
  const job = [...h.db.jobs.values()][0];
  return { order: (await h.db.getOrder(order.id))!, job };
}

function jobDeps(h: Harness) {
  return {
    db: h.db, blobs: h.blobs, mailer: h.mailer, generator: h.generator, log: h.deps.log, now: h.deps.now,
    appUrl: 'https://app.test', tokenTtlDays: 30, heartbeatMs: 60_000, pilotAllowedEmails: ['support@metaphorconsultants.com'],
    renderPdf: async () => Buffer.from('%PDF-1.4 test'),
  };
}

describe('Job pipeline: stages, checkpoints and retries', () => {
  it('runs every stage once and delivers the report', async () => {
    const h = makeHarness();
    const { order, job } = await paidJob(h);
    const out = await runJob(jobDeps(h), job.id, 'w1');
    expect(out.status).toBe('succeeded');
    expect(h.generator.researchCalls).toBe(1);
    expect(h.generator.composeCalls).toBe(1);
    expect(h.mailer.sent.map((m) => m.subject)).toHaveLength(2);
    expect(h.mailer.sent[1].attachments?.[0].filename).toMatch(/\.pdf$/);
    expect((await h.db.getOrder(order.id))!.status).toBe('fulfilled');
    const report = (await h.db.getReport(order.id))!;
    expect(report.status).toBe('delivered');
    expect(report.pdf_object_path).toMatch(/^orders\//);
    // Tokens are stored hashed only: no raw token anywhere in the db.
    const rawLink = /\/report\/([A-Za-z0-9_-]{43})/.exec(h.mailer.sent[0].text)![1];
    expect([...h.db.tokens.keys()]).not.toContain(rawLink);
  });

  it('refuses to generate for an order that is not paid', async () => {
    const h = makeHarness();
    const { order } = await createPendingOrder(h);
    const { job } = await h.db.createJob({ order_id: order.id, type: 'report' });
    const out = await runJob(jobDeps(h), job.id, 'w1');
    expect(out.status).toBe('dead');
    expect(h.generator.researchCalls).toBe(0);
  });

  it('an interrupted compose resumes without redoing research', async () => {
    const h = makeHarness();
    const { job } = await paidJob(h);
    h.generator.failComposeOnce = true;
    const first = await runJob(jobDeps(h), job.id, 'w1');
    expect(first.status).toBe('retry_scheduled');
    const after = (await h.db.getJob(job.id))!;
    expect(after.status).toBe('queued');
    expect(after.stage).toBe('compose');
    expect(after.checkpoint.research_done).toBe(true);
    expect(h.generator.researchCalls).toBe(1);

    h.clock.advance(2 * 60_000); // past the first backoff
    const second = await runJob(jobDeps(h), job.id, 'w2');
    expect(second.status).toBe('succeeded');
    expect(h.generator.researchCalls).toBe(1);
    expect(h.generator.composeCalls).toBe(2);
  });

  it('a failed report email is retried without regenerating or re-rendering', async () => {
    const h = makeHarness();
    const { job } = await paidJob(h);
    let renders = 0;
    const deps = { ...jobDeps(h), renderPdf: async () => { renders += 1; return Buffer.from('%PDF'); } };
    // Confirmation goes out; the report email fails.
    h.mailer.send = (function (orig) {
      return async function (this: typeof h.mailer, m: Parameters<typeof orig>[0]) {
        if (m.attachments) throw new Error('resend 500');
        return orig.call(this, m);
      };
    })(h.mailer.send.bind(h.mailer));
    const first = await runJob(deps, job.id, 'w1');
    expect(first.status).toBe('retry_scheduled');
    expect((await h.db.getJob(job.id))!.stage).toBe('deliver');
    expect(h.db.deliveries.filter((d) => d.kind === 'report' && d.status === 'failed')).toHaveLength(1);

    h.mailer.send = new (h.mailer.constructor as new () => typeof h.mailer)().send.bind(h.mailer);
    h.clock.advance(2 * 60_000);
    const second = await runJob(deps, job.id, 'w2');
    expect(second.status).toBe('succeeded');
    expect(h.generator.researchCalls).toBe(1);
    expect(h.generator.composeCalls).toBe(1);
    expect(renders).toBe(1);
    expect(h.db.deliveries.filter((d) => d.kind === 'confirmation' && d.status === 'sent')).toHaveLength(1);
    expect(h.db.deliveries.filter((d) => d.kind === 'report' && d.status === 'sent')).toHaveLength(1);
  });

  it('a job cannot be claimed twice while its lease is live', async () => {
    const h = makeHarness();
    const { job } = await paidJob(h);
    const first = await h.db.claimJob(job.id, 'w1', 600);
    const second = await h.db.claimJob(job.id, 'w2', 600);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('the dispatcher recovers a stalled lease and re-invokes the worker', async () => {
    const h = makeHarness();
    const { job } = await paidJob(h);
    h.workerCalls.length = 0;
    await h.db.claimJob(job.id, 'crashed-worker', 60);
    h.clock.advance(61_000);
    const summary = await dispatchJobs(h.deps);
    expect(summary.recovered).toBe(1);
    expect(summary.dispatched).toBe(1);
    expect(h.workerCalls).toEqual([job.id]);
    expect((await h.db.getJob(job.id))!.status).toBe('queued');
  });

  it('retries are bounded: after max attempts the job is dead and the order failed', async () => {
    const h = makeHarness();
    const { order, job } = await paidJob(h);
    const deps = jobDeps(h);
    for (let i = 0; i < 5; i += 1) {
      h.generator.failResearchOnce = true;
      await runJob(deps, job.id, `w${i}`);
      h.clock.advance(4 * 3_600_000);
    }
    const final = (await h.db.getJob(job.id))!;
    expect(final.status).toBe('dead');
    expect(final.attempts).toBe(5);
    expect((await h.db.getOrder(order.id))!.status).toBe('failed');
    expect(await h.db.claimJob(job.id, 'w9', 60)).toBeNull();
  });
});

describe('Worker endpoint authentication', () => {
  it('rejects calls without the worker secret', async () => {
    const h = makeHarness();
    const { job } = await paidJob(h);
    const res = await reportWorker(post('/.netlify/functions/report-worker-background', { jobId: job.id }), h.deps);
    expect(res.status).toBe(503); // config check happens first in tests (no real env) …
  });

  it('rejects a wrong bearer token and accepts the right one', async () => {
    const h = makeHarness();
    const { job } = await paidJob(h);
    const prev = { ...process.env };
    Object.assign(process.env, { ...(await import('./helpers')).TEST_ENV });
    try {
      const bad = await reportWorker(post('/x', { jobId: job.id }, { authorization: 'Bearer nope' }), h.deps);
      expect(bad.status).toBe(401);
      const ok = await reportWorker(post('/x', { jobId: job.id }, { authorization: `Bearer ${WORKER_SECRET}` }), h.deps);
      expect(ok.status).toBe(200);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k];
      Object.assign(process.env, prev);
    }
  });
});
