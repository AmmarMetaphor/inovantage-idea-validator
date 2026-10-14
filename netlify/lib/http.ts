import { ConfigError, describeMissing } from './env';
import type { Logger } from './log';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

export function errorResponse(err: unknown, log: Logger): Response {
  if (err instanceof HttpError) {
    if (err.status >= 500) log.error('http.error', { status: err.status, code: err.code, err });
    return json({ error: err.code, message: err.message, details: err.details }, err.status);
  }
  if (err instanceof ConfigError) {
    log.error('config.missing', { missing: err.missing });
    return json({ ...describeMissing(err), message: err.message }, 503);
  }
  log.error('http.unhandled', { err });
  return json({ error: 'internal', message: 'Something went wrong. Please try again.' }, 500);
}

export function requireMethod(req: Request, ...methods: string[]): void {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, 'method_not_allowed', `Use ${methods.join(' or ')}.`);
  }
}

/** Read a JSON body with a hard byte cap. */
export async function readJson<T = unknown>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', `Body must be under ${maxBytes} bytes.`);
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new HttpError(413, 'payload_too_large', `Body must be under ${maxBytes} bytes.`);
  }
  if (text.trim() === '') throw new HttpError(400, 'empty_body', 'A JSON body is required.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body must be valid JSON.');
  }
}

/** Best-effort client IP. Netlify sets x-nf-client-connection-ip. */
export function clientIp(req: Request, contextIp?: string): string {
  return (
    contextIp ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
