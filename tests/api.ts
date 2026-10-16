/*
  Handlers wrapped exactly as the Netlify function wrapper wraps them, so a
  thrown HttpError/ConfigError becomes the JSON response the client would see.
*/
import type { Deps } from '../netlify/lib/deps';
import * as report from '../netlify/lib/handlers/report';
import * as submission from '../netlify/lib/handlers/submission';
import * as webhook from '../netlify/lib/handlers/webhook';
import * as worker from '../netlify/lib/handlers/worker';
import { errorResponse } from '../netlify/lib/http';

type H = (req: Request, deps: Deps, ip?: string) => Promise<Response>;

function wrap(fn: H): H {
  return async (req, deps, ip) => {
    try {
      return await fn(req, deps, ip);
    } catch (err) {
      return errorResponse(err, deps.log);
    }
  };
}

export const createSubmission = wrap(submission.createSubmission);
export const createCheckout = wrap(submission.createCheckout);
export const stripeWebhook = wrap(webhook.stripeWebhook);
export const checkoutResult = wrap(report.checkoutResult);
export const reportStatus = wrap(report.reportStatus);
export const reportDownload = wrap(report.reportDownload);
export const reportContent = wrap(report.reportContent);
export const createUpgradeCheckout = wrap(report.createUpgradeCheckout);
export const recoverReport = wrap(report.recoverReport);
export const reportWorker = wrap(worker.reportWorker);
export const dispatchJobs = worker.dispatchJobs;
