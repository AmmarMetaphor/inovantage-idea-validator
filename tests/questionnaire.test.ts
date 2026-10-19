import { describe, expect, it } from 'vitest';
import { groupByQuestion, QUESTION_COUNT, STEPS } from '../src/questionnaire/schema';
import { validateSubmission } from '../netlify/lib/validation';
import { validAnswers } from './helpers';

describe('Eight-question questionnaire', () => {
  it('has three screens and exactly eight numbered questions including email', () => {
    expect(STEPS).toHaveLength(3);
    const numbers = new Set(STEPS.flatMap((s) => s.fields.map((f) => f.question)));
    expect([...numbers].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(QUESTION_COUNT).toBe(8);
    const emailField = STEPS[2].fields.find((f) => f.id === 'email');
    expect(emailField?.question).toBe(8);
    for (const step of STEPS) for (const g of groupByQuestion(step.fields)) expect(g.title ?? g.fields[0].questionTitle).toBeTruthy();
  });

  it('allows uncertainty and reports it rather than blocking', () => {
    const answers = { ...validAnswers(), priceEstimate: { value: '', unknown: true }, budget: { value: '', unknown: true }, revenueModel: 'unsure' };
    const r = validateSubmission(answers);
    expect(r.ok).toBe(true);
  });

  it('accepts a typed industry that is not in the list', () => {
    const r = validateSubmission({ ...validAnswers(), industry: 'Falconry services' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.answers.industry).toBe('Falconry services');
  });

  it('rejects missing required questions with field-level errors', () => {
    const r = validateSubmission({ ...validAnswers(), ideaDescription: '', targetCustomer: '', stage: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['ideaDescription', 'stage', 'targetCustomer']);
  });

  it('keeps optional answers optional: city, differentiation, price and progress note may be blank', () => {
    const r = validateSubmission({ ...validAnswers(), regionCity: '', differentiation: '', priceEstimate: { value: '', unknown: false }, progressNote: '' });
    expect(r.ok).toBe(true);
    const required = STEPS.flatMap((s) => s.fields).filter((f) => f.required).map((f) => f.id);
    expect(required).toEqual(['ideaDescription', 'targetCustomer', 'industry', 'country', 'revenueModel', 'budget', 'hoursPerWeek', 'experience', 'stage', 'email', 'ackScope', 'ackTerms']);
  });

  it('still builds a brief for a version-2 submission', async () => {
    const { buildBrief } = await import('../netlify/lib/research');
    const v2 = { ...validAnswers(), stage: 'trading-new', validation: ['conversations'], evidenceDetail: 'Spoke to 12 owners.' };
    const brief = buildBrief({ orderRef: 'V2', market: 'UK', currency: 'GBP', ideaName: 'V2', answers: v2, answersVersion: 2 });
    expect(brief.existingBusiness).toBe(true);
    expect(brief.lines.some((l) => l.startsWith('Validation already attempted'))).toBe(true);
    expect(brief.lines.some((l) => l.startsWith('What makes your approach different'))).toBe(false);
  });
});
