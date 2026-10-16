import type { Db, AccessToken } from './db/types';
import { generateToken, hashToken } from './crypto';

export interface MintedToken {
  token: string;
  record: AccessToken;
  statusPath: string;
  statusUrl: string;
}

/**
 * Create a report access token. Only the hash is persisted.
 * ttlDays = 0 means the token does not expire (used for email-delivered links,
 * which are the customer's ongoing access). notAfter caps it either way.
 */
export async function mintAccessToken(db: Db, input: { orderId: string; issuedVia: AccessToken['issued_via']; ttlDays: number; now: Date; appUrl: string; notAfter?: string | null }): Promise<MintedToken> {
  let expires: Date | null = input.ttlDays > 0 ? new Date(input.now.getTime() + input.ttlDays * 86_400_000) : null;
  if (input.notAfter) {
    const cap = new Date(input.notAfter);
    if (!expires || cap < expires) expires = cap;
  }
  const token = generateToken();
  const record = await db.createAccessToken({ order_id: input.orderId, token_hash: hashToken(token), issued_via: input.issuedVia, expires_at: expires ? expires.toISOString() : null });
  const statusPath = `/report/${token}`;
  return { token, record, statusPath, statusUrl: `${input.appUrl}${statusPath}` };
}

export type TokenCheck =
  | { ok: true; token: AccessToken }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' };

/** Resolve a presented token to its record without revealing why it failed. */
export async function checkAccessToken(db: Db, presented: string, now: Date): Promise<TokenCheck> {
  const record = await db.findAccessToken(hashToken(presented));
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.revoked_at) return { ok: false, reason: 'revoked' };
  if (record.expires_at && new Date(record.expires_at) <= now) return { ok: false, reason: 'expired' };
  return { ok: true, token: record };
}
