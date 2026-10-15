/*
  GET /api/health — configuration readiness, names only, no values.
*/
import { ConfigError, loadEnv, type EnvGroup } from '../lib/env';
import { netlifyFunction } from '../lib/function';
import { json } from '../lib/http';

const GROUPS: EnvGroup[] = ['db', 'stripe', 'anthropic', 'email', 'worker'];

export default netlifyFunction('health', async () => {
  const configured: Record<string, boolean | string[]> = {};
  const missing = new Set<string>();
  for (const g of GROUPS) {
    try {
      loadEnv([g]);
      configured[g] = true;
    } catch (err) {
      configured[g] = false;
      if (err instanceof ConfigError) err.missing.forEach((m) => missing.add(m));
    }
  }
  const ready = Object.values(configured).every((v) => v === true);
  // Pilot readiness: everything except Stripe. Presence only, not connectivity.
  const pilotEnabled = process.env.PILOT_MODE === 'true';
  let pilotConfigured = false;
  if (pilotEnabled) {
    try {
      loadEnv(['pilot']);
      pilotConfigured = true;
    } catch (err) {
      if (err instanceof ConfigError) err.missing.forEach((m) => missing.add(m));
    }
  }
  const pilotReady = pilotEnabled && pilotConfigured && ['db', 'anthropic', 'email', 'worker'].every((g) => configured[g] === true);
  return json(
    {
      ok: true,
      ready,
      pilot: { enabled: pilotEnabled, ready: pilotReady },
      checks: 'configuration presence only; no external connectivity is tested',
      context: process.env.CONTEXT ?? 'dev',
      generator: process.env.REPORT_GENERATOR ?? 'anthropic',
      configured,
      missing: [...missing],
    },
    ready || pilotReady ? 200 : 503,
  );
});
