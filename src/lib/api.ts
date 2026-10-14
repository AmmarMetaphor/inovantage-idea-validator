/*
  API client. In demo mode every call is simulated in the browser and clearly
  labelled as such in the UI. Outside demo mode the same functions call the
  Netlify Functions listed in netlify/functions/README.md, which do not exist
  yet; they will fail with a clear error until the backend is built.
*/
import { DEMO_MODE } from '@/config/product';
import type { Answers } from '@/questionnaire/types';
import { maskEmail } from '@/questionnaire/helpers';

export type ReportStage = 'received' | 'paid' | 'researching' | 'compiling' | 'ready' | 'failed';

export interface ReportStatus {
  reportId: string;
  stage: ReportStage;
  /** Masked email the report will be / was sent to. */
  emailMasked: string;
  createdAt: string;
  /** Present only when stage === 'ready'. */
  pdfUrl?: string;
  /** True when this status came from the demo simulator. */
  demo: boolean;
}

export interface CheckoutSession {
  reportId: string;
  /** Where to send the customer to pay. In demo mode this is an internal route. */
  checkoutUrl: string;
  demo: boolean;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(
      `The service responded with ${res.status}. The backend for this action is not connected yet.`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------------------
   Demo simulator: sessionStorage holds a tiny, non-sensitive order record
   (report id, masked email, timestamps) so the status page survives refresh.
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

/** Timeline (seconds after payment) that the demo status page walks through. */
const DEMO_STAGE_SECONDS: { stage: ReportStage; after: number }[] = [
  { stage: 'paid', after: 0 },
  { stage: 'researching', after: 6 },
  { stage: 'compiling', after: 14 },
  { stage: 'ready', after: 22 },
];

function demoStageFor(order: DemoOrder): ReportStage {
  if (!order.paidAt) return 'received';
  const elapsed = (Date.now() - new Date(order.paidAt).getTime()) / 1000;
  let stage: ReportStage = 'paid';
  for (const s of DEMO_STAGE_SECONDS) if (elapsed >= s.after) stage = s.stage;
  return stage;
}

/* ---------------------------------------------------------------------------
   Public API
--------------------------------------------------------------------------- */

export async function createCheckout(answers: Answers): Promise<CheckoutSession> {
  const email = typeof answers.email === 'string' ? answers.email : '';
  if (DEMO_MODE) {
    await sleep(700);
    const reportId = makeDemoId();
    const orders = readDemoOrders();
    orders[reportId] = { reportId, emailMasked: maskEmail(email), createdAt: new Date().toISOString() };
    writeDemoOrders(orders);
    return { reportId, checkoutUrl: `/checkout?report=${reportId}`, demo: true };
  }
  return request<CheckoutSession>('/api/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
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

export async function getReportStatus(reportId: string): Promise<ReportStatus> {
  if (DEMO_MODE) {
    await sleep(400);
    const order = readDemoOrders()[reportId];
    if (!order) {
      throw new ApiError(
        'No demo report with that reference exists in this browser tab. Demo reports are not stored anywhere else.',
        404,
      );
    }
    const stage = demoStageFor(order);
    return {
      reportId,
      stage,
      emailMasked: order.emailMasked,
      createdAt: order.createdAt,
      pdfUrl: stage === 'ready' ? '#demo-pdf-not-generated' : undefined,
      demo: true,
    };
  }
  return request<ReportStatus>(`/api/report-status?id=${encodeURIComponent(reportId)}`);
}

export async function requestRecoveryLink(email: string): Promise<{ ok: true; demo: boolean }> {
  if (DEMO_MODE) {
    await sleep(800);
    return { ok: true, demo: true };
  }
  await request<unknown>('/api/recover-report', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return { ok: true, demo: false };
}

export { ApiError };
