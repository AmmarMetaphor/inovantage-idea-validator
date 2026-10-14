/*
  Scheduled dispatcher: every 5 minutes, recover stalled leases, expire
  abandoned checkouts, and invoke the worker for queued jobs. Scheduled
  functions cannot be called from outside and must finish within 30 seconds.
*/
import type { Config } from '@netlify/functions';
import { dispatchJobs } from '../lib/handlers/worker';
import { netlifyFunction } from '../lib/function';
import { json } from '../lib/http';

export default netlifyFunction('dispatch-jobs', async (_req, deps) => {
  const summary = await dispatchJobs(deps);
  return json(summary);
});

export const config: Config = { schedule: '*/5 * * * *' };
