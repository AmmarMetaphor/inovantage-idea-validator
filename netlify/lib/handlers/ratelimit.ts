import type { Deps } from '../deps';
import { HttpError } from '../http';

/** Throws 429 when the key exceeds `limit` calls per `windowSeconds`. */
export async function enforceRateLimit(deps: Deps, key: string, limit: number, windowSeconds: number): Promise<void> {
  const { allowed } = await deps.db.consumeRateLimit(key, limit, windowSeconds);
  if (!allowed) {
    deps.log.warn('rate_limit.exceeded', { key_prefix: key.split(':')[0] });
    throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait a few minutes and try again.');
  }
}
