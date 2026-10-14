import type { Answers, AnswerValue, Estimate } from './types';

export function isEstimate(v: AnswerValue | undefined): v is Estimate {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'unknown' in v;
}

export function asString(v: AnswerValue | undefined): string {
  return typeof v === 'string' ? v : '';
}

export function asArray(v: AnswerValue | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

export function asBool(v: AnswerValue | undefined): boolean {
  return v === true;
}

export function asEstimate(v: AnswerValue | undefined): Estimate {
  return isEstimate(v) ? v : { value: '', unknown: false };
}

/** Stages that mean the customer already trades. */
export const EXISTING_BUSINESS_STAGES = ['trading-new', 'trading-established'];

export function isExistingBusiness(answers: Answers): boolean {
  return EXISTING_BUSINESS_STAGES.includes(asString(answers.stage));
}

/** Parse a user-typed number: strips spaces, commas and currency symbols. */
export function parseNumberInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n);
}

/** Simple, permissive email check; the server will validate properly. */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  // one @, something before, a dot after with no spaces
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Mask an email for display: ja***@example.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}
