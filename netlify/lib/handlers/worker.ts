import { randomUUID } from 'node:crypto';
import { secretsEqual } from '../crypto';
import type { Deps } from '../deps';
import { loadEnv } from '../env';
import { bearerToken, HttpError, isObject, json, readJson, requireMethod } from '../http';
import { runJob } from '../jobs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireWorkerAuth(req: Request, workerSecret: string): void {
  const presented = bearerToken(req);
  if (!presented || !workerSecret || !secretsEqual(presented, workerSecret)) {
    throw new HttpError(401, 'unauthorised', 'Worker authentication failed.');
  }
}

/** POST /.netlify/functions/report-worker-background { jobId } (Bearer WORKER_SECRET) */
export async function reportWorker(req: Request, deps: Deps): Promise<Response> {
  requireMethod(req, 'POST');
  const env = loadEnv(['worker', 'db', 'email', 'anthropic']);
  requireWorkerAuth(req, env.workerSecret);
  const body = await readJson<unknown>(req, 1024);
  if (!isObject(body) || typeof body.jobId !== 'string' || !UUID_RE.test(body.jobId)) throw new HttpError(400, 'invalid_body', 'jobId is required.');

  const workerId = `w_${randomUUID().slice(0, 8)}`;
  const outcome = await runJob(
    {
      db: deps.db,
      blobs: deps.blobs,
      mailer: deps.mailer,
      generator: deps.generator,
      log: deps.log.child({ worker_id: workerId }),
      now: deps.now,
      appUrl: env.appUrl,
      tokenTtlDays: env.tokenTtlDays,
      ownerAlertEmail: env.ownerAlertEmail,
    },
    body.jobId,
    workerId,
  );
  return json({ outcome: outcome.status });
}

/**
 * Scheduled dispatcher. Recovers stalled leases, expires abandoned checkouts,
 * and kicks the worker for every runnable job. Must finish well inside the
 * 30-second scheduled-function limit, so it only *invokes* workers.
 */
export async function dispatchJobs(deps: Deps): Promise<{ recovered: number; dispatched: number; expired: number }> {
  const now = deps.now().toISOString();
  const recovered = await deps.db.recoverStalledJobs();
  for (const j of recovered) {
    deps.log.warn('dispatch.recovered_stalled', { job_id: j.id, status: j.status, attempts: j.attempts });
    if (j.status === 'dead') await deps.db.setOrderStatus(j.order_id, 'failed', { failed_reason: 'report generation stalled' });
  }
  const expired = await deps.db.expireStaleCheckouts(now);
  const runnable = await deps.db.findRunnableJobs(now, 10);
  let dispatched = 0;
  for (const job of runnable) {
    try {
      await deps.invokeWorker(job.id);
      dispatched += 1;
    } catch (err) {
      deps.log.warn('dispatch.invoke_failed', { job_id: job.id, err });
    }
  }
  try {
    await deps.db.pruneRateLimits();
  } catch (err) {
    deps.log.warn('dispatch.prune_failed', { err });
  }
  deps.log.info('dispatch.done', { recovered: recovered.length, dispatched, expired });
  return { recovered: recovered.length, dispatched, expired };
}
