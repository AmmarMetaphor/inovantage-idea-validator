/**
 * Browser-only runtime flags. Kept separate from product.ts so server code
 * (Netlify Functions) can import product configuration and the questionnaire
 * schema without touching import.meta.env.
 */

/**
 * Demo mode: simulated checkout and report processing, no backend required.
 * Anything other than the literal string "false" keeps demo mode ON so a
 * fresh clone previews safely. Production builds refuse to ship with demo
 * mode on (see scripts/check-build-env.mjs).
 */
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE !== 'false';

/**
 * Draft persistence for questionnaire answers.
 * "none" (default): answers live in memory only and vanish on refresh.
 * "session": answers are kept in sessionStorage for this tab only.
 * localStorage is deliberately not an option.
 */
export const DRAFT_STORAGE: 'none' | 'session' =
  import.meta.env.VITE_DRAFT_STORAGE === 'session' ? 'session' : 'none';
