/*
  Background function (the "-background" suffix gives it the 15-minute
  execution limit and makes Netlify respond 202 immediately). Invoked only
  with the WORKER_SECRET bearer token, by the webhook or the dispatcher.
  All progress is persisted in the jobs table, never in process memory.
*/
import { reportWorker } from '../lib/handlers/worker';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('report-worker', (req, deps) => reportWorker(req, deps));
