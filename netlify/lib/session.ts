/*
  Stateless, signed owner session for the pilot page.

  Token = base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))
  Payload = { v: 1, iat, exp, nonce }. Carried in a Secure, HttpOnly,
  SameSite=Strict cookie. Nothing is stored server-side; revocation happens
  by rotating PILOT_SESSION_SECRET or waiting for expiry.
*/
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const OWNER_COOKIE = 'iv_owner';
export const OWNER_SESSION_SECONDS = 2 * 60 * 60;

interface Payload {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createOwnerSession(secret: string, now: Date, ttlSeconds = OWNER_SESSION_SECONDS): { token: string; expiresAt: Date } {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: Payload = { v: 1, iat, exp: iat + ttlSeconds, nonce: randomBytes(8).toString('base64url') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body, secret)}`, expiresAt: new Date(payload.exp * 1000) };
}

export function verifyOwnerSession(token: string | null | undefined, secret: string, now: Date): { ok: true; expiresAt: Date } | { ok: false } {
  if (!token || token.length > 512) return { ok: false };
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false };
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload;
  } catch {
    return { ok: false };
  }
  if (payload.v !== 1 || typeof payload.exp !== 'number') return { ok: false };
  if (payload.exp * 1000 <= now.getTime()) return { ok: false };
  return { ok: true, expiresAt: new Date(payload.exp * 1000) };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [`${OWNER_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

export function clearCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}
