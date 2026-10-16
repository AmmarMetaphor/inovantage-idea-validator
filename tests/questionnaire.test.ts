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
    const r = validateSubmission({ ...validAnswers(), ideaDescription: '', regionCity: '', validation: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['ideaDescription', 'regionCity', 'validation']);
  });
});
