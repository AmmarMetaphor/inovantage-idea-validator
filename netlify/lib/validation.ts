/*
  Server-side validation of a questionnaire submission.

  Reuses the same declarative schema as the browser (src/questionnaire) so the
  server is the authority: unknown keys are dropped, every value is coerced to
  its declared shape and capped in size, and the step validators must all pass.
*/
import { MARKETS } from '../../src/config/product';
import { asString, isValidEmail } from '../../src/questionnaire/helpers';
import { STEPS } from '../../src/questionnaire/schema';
import type { Answers, AnswerValue, Field } from '../../src/questionnaire/types';
import { validateStep } from '../../src/questionnaire/validate';

export const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_MAX_TEXT = 1000;
const MAX_ARRAY_ITEMS = 20;
const MAX_ESTIMATE_CHARS = 32;

export interface ValidSubmission {
  answers: Answers;
  email: string;
  market: 'UK' | 'US' | 'AU';
  currency: 'GBP' | 'USD' | 'AUD';
  ideaName: string;
}

export interface ValidationFailure {
  ok: false;
  errors: Record<string, string>;
}

export type ValidationResult = { ok: true; value: ValidSubmission } | ValidationFailure;

const FIELDS: Field[] = STEPS.flatMap((s) => s.fields);
const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

function cleanString(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  // Strip control characters except newline/tab, collapse NULs, cap length.
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s.slice(0, max);
}

function coerce(field: Field, raw: unknown): AnswerValue | undefined {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return cleanString(raw, field.maxLength ?? DEFAULT_MAX_TEXT);
    case 'email':
      return cleanString(raw, 254);
    case 'select':
    case 'radio': {
      const s = cleanString(raw, 64);
      return s && field.options.some((o) => o.value === s) ? s : undefined;
    }
    case 'checkbox-group': {
      if (!Array.isArray(raw)) return undefined;
      const allowed = new Set(field.options.map((o) => o.value));
      const out = [...new Set(raw.filter((x): x is string => typeof x === 'string' && allowed.has(x)))];
      return out.slice(0, MAX_ARRAY_ITEMS);
    }
    case 'checkbox':
      return raw === true;
    case 'estimate': {
      if (typeof raw !== 'object' || raw === null) return undefined;
      const r = raw as { value?: unknown; unknown?: unknown };
      const unknown = r.unknown === true;
      const value = unknown ? '' : (cleanString(r.value, MAX_ESTIMATE_CHARS) ?? '');
      return { value, unknown };
    }
  }
}

/** Whitelist and coerce an untrusted answers object. */
export function sanitiseAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = FIELD_BY_ID.get(key);
    if (!field) continue; // unknown keys are dropped silently
    const v = coerce(field, value);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function validateSubmission(raw: unknown): ValidationResult {
  const answers = sanitiseAnswers(raw);
  const errors: Record<string, string> = {};
  for (let i = 0; i < STEPS.length; i += 1) Object.assign(errors, validateStep(i, answers));

  const email = asString(answers.email).trim();
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';

  const market = asString(answers.country) as 'UK' | 'US' | 'AU';
  const marketDef = MARKETS.find((m) => m.code === market);
  if (!marketDef) errors.country = 'Choose a primary market.';

  const currency = asString(answers.currency) as 'GBP' | 'USD' | 'AUD';
  if (!['GBP', 'USD', 'AUD'].includes(currency)) errors.currency = 'Choose a currency.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { answers, email, market, currency, ideaName: asString(answers.ideaName).trim() },
  };
}
