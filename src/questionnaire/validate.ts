import { asArray, asBool, asEstimate, asString, isValidEmail, parseNumberInput } from './helpers';
import { STEPS, visibleFields } from './schema';
import type { Answers, Field, StepErrors } from './types';

const REQUIRED = 'This field is required.';

export function validateField(field: Field, answers: Answers): string | null {
  const value = answers[field.id];

  switch (field.type) {
    case 'text':
    case 'textarea': {
      const s = asString(value).trim();
      if (field.required && s.length === 0) return REQUIRED;
      if (field.maxLength && s.length > field.maxLength) {
        return `Please keep this under ${field.maxLength} characters.`;
      }
      return null;
    }
    case 'email': {
      const s = asString(value).trim();
      if (field.required && s.length === 0) return REQUIRED;
      if (s.length > 0 && !isValidEmail(s)) return 'Enter a valid email address, like name@example.com.';
      return null;
    }
    case 'select':
    case 'radio': {
      const s = asString(value);
      if (field.required && s.length === 0) return 'Choose an option.';
      if (s && !field.options.some((o) => o.value === s)) return 'Choose a valid option.';
      return null;
    }
    case 'checkbox-group': {
      const arr = asArray(value);
      const min = field.min ?? 1;
      if (field.required && arr.length < min) {
        return min === 1 ? 'Choose at least one option.' : `Choose at least ${min} options.`;
      }
      return null;
    }
    case 'checkbox': {
      if (field.required && !asBool(value)) return 'You need to tick this box to continue.';
      return null;
    }
    case 'estimate': {
      const est = asEstimate(value);
      if (est.unknown) return null;
      const raw = est.value.trim();
      if (raw === '') {
        if (field.required) {
          return field.allowUnknown === false
            ? 'Enter a number.'
            : 'Enter a number, or tick “I don’t know yet”.';
        }
        return null;
      }
      const n = parseNumberInput(raw);
      if (n === null) return 'Enter a number using digits only.';
      if (field.min !== undefined && n < field.min) return `Enter a number of at least ${field.min}.`;
      if (field.max !== undefined && n > field.max) return `Enter a number no greater than ${field.max}.`;
      return null;
    }
  }
}

export function validateStep(stepIndex: number, answers: Answers): StepErrors {
  const step = STEPS[stepIndex];
  const errors: StepErrors = {};
  if (!step) return errors;
  for (const field of visibleFields(step, answers)) {
    const err = validateField(field, answers);
    if (err) errors[field.id] = err;
  }
  return errors;
}

export function isStepComplete(stepIndex: number, answers: Answers): boolean {
  return Object.keys(validateStep(stepIndex, answers)).length === 0;
}

/** Index of the first step with errors, or -1 if everything validates. */
export function firstInvalidStep(answers: Answers): number {
  for (let i = 0; i < STEPS.length; i += 1) {
    if (!isStepComplete(i, answers)) return i;
  }
  return -1;
}
