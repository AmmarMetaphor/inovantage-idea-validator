/*
  API client. In demo mode every call is simulated in the browser and clearly
  labelled as such in the UI. Outside demo mode the same functions call the
  Netlify Functions under /api (see docs/BACKEND.md). Report access uses an
  unguessable token from the email link; it is sent in a POST body, never in
  a query string, so it does not land in server access logs.
*/
import { DEMO_MODE } from '@/config/runtime';
import type { Answers } from '@/questionnaire/types';
import { maskEmail } from '@/questionnaire/helpers';

export type ReportStage =
  | 'confirming_payment'
  | 'payment_confirmed'
  | 'submission_received'
  | 'queued_for_research'
  | 'researching'
  | 'writing'
  | 'ready'
  | 'email_sent'
  | 'failed'
  | 'expired';

export type JobState = 'none' | 'queued' | 'running' | 'retrying' | 'failed' | 'done';

export interface TierStatus {
  stage: ReportStage;
  label: string;
  pdfAvailable: boolean;
  /** Final report email accepted by the provider. */
  emailSent: boolean;
  /** Initial confirmation email accepted by the provider. */
  confirmationEmailSent: boolean;
  verdict: string | null;
  job: { state: JobState; attempts: number; nextRetryAt: string | null };
}

export interface ReportStatus {
  reportRef: string;
  ideaName: string;
  orderedAt: string;
  expiresAt: string | null;
  emailMasked: string;
  isPilot: boolean;
  standard: TierStatus;
  detailed: (TierStatus & { purchased: boolean }) | null;
  upgrade: { price: string; priceNote: string; available: boolean };
  demo: boolean;
}

export interface CheckoutSession {
  reportRef: string;
  /** Internal route (demo) or an absolute hosted checkout URL (live). */
  checkoutUrl: string;
  demo: boolean;
}

export type CheckoutResult =
  | { state: 'pending'; product?: 'standard' | 'upgrade' }
  | { state: 'paid'; product?: 'standard' | 'upgrade'; reportPath: string | null; message?: string }
  | { state: 'expired' | 'failed' | 'rejected'; product?: 'standard' | 'upgrade' };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(message: string, status: number, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    referrerPolicy: 'no-referrer',
    ...init,
  });
  let body: { error?: string; message?: string; details?: unknown; missing?: string[] } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const message =
      body.error === 'not_configured'
        ? `This site is not fully set up yet (missing: ${(body.missing ?? []).join(', ')}). Please contact the site owner.`
        : (body.message ?? `The service responded with ${res.status}.`);
    throw new ApiError(message, res.status, body.error ?? 'error', body.details);
  }
  return body as T;
}

/* ---------------------------------------------------------------------------
   Demo simulator: sessionStorage holds a tiny, non-sensitive order record
   (report ref, masked email, timestamps) so the status page survives refresh.
   Questionnaire answers are never written here.
--------------------------------------------------------------------------- */

const DEMO_ORDERS_KEY = 'inovantage.demo.orders.v1';

interface DemoOrder {
  reportId: string;
  emailMasked: string;
  createdAt: string;
  paidAt?: string;
}

function readDemoOrders(): Record<string, DemoOrder> {
  try {
    const raw = window.sessionStorage.getItem(DEMO_ORDERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DemoOrder>) : {};
  } catch {
    return {};
  }
}

function writeDemoOrders(orders: Record<string, DemoOrder>) {
  try {
    window.sessionStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    /* ignore */
  }
}

function makeDemoId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'DEMO-';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isDemoReference(ref: string): boolean {
  return ref.startsWith('DEMO-');
}

/* ---------------------------------------------------------------------------
   Public API
--------------------------------------------------------------------------- */

export async function createCheckout(answers: Answers, clientRequestId?: string): Promise<CheckoutSession> {
  const email = typeof answers.email === 'string' ? answers.email : '';
  if (DEMO_MODE) {
    await sleep(700);
    const reportId = makeDemoId();
    const orders = readDemoOrders();
    orders[reportId] = { reportId, emailMasked: maskEmail(email), createdAt: new Date().toISOString() };
    writeDemoOrders(orders);
    return { reportRef: reportId, checkoutUrl: `/checkout?report=${reportId}`, demo: true };
  }
  const { submissionId } = await request<{ submissionId: string }>('/api/create-submission', {
    method: 'POST',
    body: JSON.stringify({ answers, website: '', clientRequestId }),
  });
  const session = await request<{ checkoutUrl: string; orderRef: string }>('/api/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ submissionId }),
  });
  return { reportRef: session.orderRef, checkoutUrl: session.checkoutUrl, demo: false };
}

/** Demo only: mark a simulated order as paid. */
export async function demoCompletePayment(reportId: string): Promise<void> {
  await sleep(900);
  const orders = readDemoOrders();
  const order = orders[reportId];
  if (!order) throw new ApiError('Demo order not found in this browser tab.', 404);
  order.paidAt = new Date().toISOString();
  writeDemoOrders(orders);
}

/** Live only: ask the server whether a checkout session has been paid and fulfilled. */
export async function getCheckoutResult(sessionId: string): Promise<CheckoutResult> {
  return request<CheckoutResult>(`/api/checkout-result?session_id=${encodeURIComponent(sessionId)}`, { method: 'GET' });
}

export async function getReportStatus(tokenOrDemoRef: string): Promise<ReportStatus> {
  if (DEMO_MODE && isDemoReference(tokenOrDemoRef)) {
    await sleep(300);
    const order = readDemoOrders()[tokenOrDemoRef];
    if (!order) {
      throw new ApiError('No demo report with that reference exists in this browser tab. Demo reports are not stored anywhere else.', 404);
    }
    // Demo mode does not simulate progress: the pipeline is simply not run.
    const stage: ReportStage = order.paidAt ? 'payment_confirmed' : 'confirming_payment';
    const tier: TierStatus = { stage, label: stage === 'payment_confirmed' ? 'Payment confirmed (demo: no processing)' : 'Confirming your payment', pdfAvailable: false, emailSent: false, confirmationEmailSent: false, verdict: null, job: { state: 'none', attempts: 0, nextRetryAt: null } };
    return { reportRef: tokenOrDemoRef, ideaName: 'Demo idea', orderedAt: order.createdAt, expiresAt: null, emailMasked: order.emailMasked, isPilot: false, standard: tier, detailed: null, upgrade: { price: '£35', priceNote: 'additional, one-time payment', available: false }, demo: true };
  }
  const s = await request<Omit<ReportStatus, 'demo'>>('/api/report-status', { method: 'POST', body: JSON.stringify({ token: tokenOrDemoRef }) });
  return { ...s, demo: false };
}

export type ReportTier = 'standard' | 'detailed';

/** Live only: structured report data (the detailed tier only after it is purchased). */
export async function getReportContent<T = unknown>(token: string, tier: ReportTier): Promise<{ tier: ReportTier; reportRef: string; generatedAt: string | null; content: T; financials: FinancialResult }> {
  return request('/api/report-content', { method: 'POST', body: JSON.stringify({ token, tier }) });
}

/** Live only: a fresh storage URL for the PDF. Call it on every click; it never shows a deadline to the customer. */
export async function getReportDownloadUrl(token: string, tier: ReportTier = 'standard'): Promise<{ url: string; tier: ReportTier }> {
  return request('/api/report-download', { method: 'POST', body: JSON.stringify({ token, tier }) });
}

/** Live only: start the detailed upgrade purchase (or a pilot upgrade with an owner session). */
export async function createUpgradeCheckout(token: string): Promise<{ checkoutUrl?: string; reportPath?: string; pilot?: boolean }> {
  return request('/api/create-upgrade-checkout', { method: 'POST', body: JSON.stringify({ token }), credentials: 'same-origin' });
}

export interface FinancialResult {
  currency: string;
  complete: boolean;
  missing: string[];
  contributionPerUnit: number | null;
  contributionMarginPct: number | null;
  breakEvenUnits: number | null;
  breakEvenNote: string;
  rows: { label: 'Low' | 'Base' | 'High'; units: number; revenue: number; variableCosts: number; contribution: number; fixedCosts: number; profit: number }[];
  assumptions: { label: string; value: string; basis: 'customer_input' | 'assumption' | 'evidence'; note?: string }[];
}

export async function requestRecoveryLink(email: string): Promise<{ ok: true; demo: boolean }> {
  if (DEMO_MODE) {
    await sleep(800);
    return { ok: true, demo: true };
  }
  await request<unknown>('/api/recover-report', { method: 'POST', body: JSON.stringify({ email }) });
  return { ok: true, demo: false };
}

/* ---------------------------------------------------------------------------
   Owner pilot (server-gated; the browser only sees "authenticated" or not)
--------------------------------------------------------------------------- */

export interface OwnerSession {
  authenticated: boolean;
  pilotMode: boolean;
  expiresAt?: string;
  allowedEmails?: string[];
  generator?: string;
  model?: string;
  context?: string;
}

export async function getOwnerSession(): Promise<OwnerSession> {
  const res = await fetch('/api/owner-session', { headers: { Accept: 'application/json' }, credentials: 'same-origin', referrerPolicy: 'no-referrer' });
  if (res.status === 404) return { authenticated: false, pilotMode: false };
  if (!res.ok) throw new ApiError(`The service responded with ${res.status}.`, res.status);
  return (await res.json()) as OwnerSession;
}

export async function ownerLogin(password: string): Promise<{ ok: true; expiresAt: string }> {
  return request('/api/owner-login', { method: 'POST', body: JSON.stringify({ password }), credentials: 'same-origin' });
}

export async function ownerLogout(): Promise<void> {
  await request('/api/owner-logout', { method: 'POST', credentials: 'same-origin' });
}

export interface PilotOrderResult {
  reportPath: string;
  orderRef: string;
  created: boolean;
  jobId: string;
}

export async function createPilotOrder(answers: Answers, clientRequestId: string): Promise<PilotOrderResult> {
  return request('/api/pilot-order', { method: 'POST', body: JSON.stringify({ answers, clientRequestId }), credentials: 'same-origin' });
}
