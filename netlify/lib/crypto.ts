import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, base64url (43 chars). Only its hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Hash used for storing/looking up access tokens. */
export function hashToken(token: string): string {
  return sha256Hex(`access-token:${token}`);
}

/** Hash an IP for rate limiting and abuse analysis without storing the IP. */
export function hashIp(ip: string, salt: string): string {
  return sha256Hex(`${salt}:${ip}`).slice(0, 32);
}

/** Constant-time comparison of two secrets of possibly different length. */
export function secretsEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[email]';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

/** Short human-facing order reference derived from a UUID (not a secret). */
export function shortRef(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function isValidTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,48}$/.test(token);
}
