import { MARKETS } from '../config/product';
import { asArray, asString } from './helpers';
import type { Answers, Field, Step } from './types';

/*
  Version 2 questionnaire: eight numbered questions over three short screens.
  Fields sharing a `question` number render as one compact question. Nothing
  here is compulsory beyond the eight questions; uncertainty is allowed with
  "Not sure" options and is reported as a gap in the report.
*/

export const ANSWERS_VERSION = 2;

export const INDUSTRIES = [
  { value: 'food-drink', label: 'Food and drink' },
  { value: 'retail-ecommerce', label: 'Retail or e-commerce' },
  { value: 'professional-services', label: 'Professional or business services' },
  { value: 'health-wellness', label: 'Health, fitness or wellness' },
  { value: 'education', label: 'Education or training' },
  { value: 'software', label: 'Software, apps or digital products' },
  { value: 'trades-construction', label: 'Trades, construction or home services' },
  { value: 'creative-media', label: 'Creative, media or marketing' },
  { value: 'hospitality-tourism', label: 'Hospitality, events or tourism' },
  { value: 'manufacturing', label: 'Manufacturing or physical products' },
  { value: 'transport-logistics', label: 'Transport or logistics' },
  { value: 'property', label: 'Property or real estate' },
  { value: 'finance', label: 'Finance or insurance' },
  { value: 'personal-services', label: 'Personal services (beauty, childcare, pets…)' },
  { value: 'agriculture', label: 'Agriculture or environment' },
  { value: 'other', label: 'Other (type your own)' },
];

export const STAGES = [
  { value: 'idea', label: 'Just an idea' },
  { value: 'planning', label: 'Researching and planning' },
  { value: 'building', label: 'Building before launch' },
  { value: 'trading-new', label: 'Recently launched (under 12 months)' },
  { value: 'trading-established', label: 'Existing business adding this' },
];

export const REVENUE_MODELS = [
  { value: 'one-off', label: 'One-off sales' },
  { value: 'subscription', label: 'Subscription or membership' },
  { value: 'time', label: 'Hourly or day rate' },
  { value: 'project', label: 'Project or package fees' },
  { value: 'commission', label: 'Commission or marketplace fees' },
  { value: 'advertising', label: 'Advertising or sponsorship' },
  { value: 'mixed', label: 'A mix' },
  { value: 'unsure', label: 'Not sure yet' },
];

export const HOURS = [
  { value: 'lt5', label: 'Under 5 hours a week' },
  { value: '5-10', label: '5 to 10 hours' },
  { value: '10-20', label: '10 to 20 hours' },
  { value: '20-35', label: '20 to 35 hours' },
  { value: '35plus', label: 'Full time (35+)' },
];

export const EXPERIENCE = [
  { value: 'none', label: 'None in this industry' },
  { value: 'some', label: 'Some (worked in or around it)' },
  { value: 'substantial', label: 'Substantial (years, senior or specialist)' },
  { value: 'ran-business', label: 'I have run a business before' },
];

export const VALIDATION = [
  { value: 'none', label: 'Nothing yet' },
  { value: 'conversations', label: 'Talked to potential customers' },
  { value: 'survey', label: 'Survey or research responses' },
  { value: 'waitlist', label: 'Waiting list or sign-ups' },
  { value: 'preorders', label: 'Pre-orders or deposits' },
  { value: 'paying', label: 'Paying customers already' },
  { value: 'pilot', label: 'Pilot, trial or test sales' },
];

export const STEPS: Step[] = [
  {
    id: 'idea',
    shortTitle: 'Idea',
    title: 'Your idea',
    intro: 'Three short questions. Plain language is fine; specifics beat polish.',
    fields: [
      {
        id: 'ideaDescription',
        type: 'textarea',
        label: 'What is your business idea, and what problem does it solve?',
        help: 'What you would sell, to whom, and the pain or need it meets. Two to five sentences.',
        required: true,
        maxLength: 1200,
        rows: 5,
        question: 1,
        questionTitle: 'Your business idea and the problem it solves',
      },
      {
        id: 'ideaName',
        type: 'text',
        label: 'Working name (optional)',
        maxLength: 80,
        placeholder: 'e.g. Northside Mobile Dog Grooming',
        question: 1,
      },
      {
        id: 'industry',
        type: 'combobox',
        label: 'Industry',
        help: 'Start typing to search. Choose the closest match, or type your own.',
        required: true,
        options: INDUSTRIES,
        placeholder: 'Search or type an industry',
        maxLength: 80,
        question: 2,
        questionTitle: 'Industry',
      },
      {
        id: 'country',
        type: 'radio',
        label: 'Country',
        required: true,
        options: MARKETS.map((m) => ({ value: m.code, label: m.label })),
        question: 3,
        questionTitle: 'Where will you operate?',
        questionHelp: 'One report covers one primary market.',
      },
      {
        id: 'regionCity',
        type: 'text',
        label: 'City or region',
        required: true,
        maxLength: 120,
        placeholder: 'e.g. Leeds',
        question: 3,
      },
    ],
  },
  {
    id: 'customers',
    shortTitle: 'Customers',
    title: 'Customers and money',
    intro: 'Rough answers are fine. “Not sure” is a valid answer and the report will say what was assumed.',
    fields: [
      {
        id: 'targetCustomer',
        type: 'textarea',
        label: 'Who is your target customer, and why would they choose you over alternatives?',
        help: 'Describe a typical buyer and your reason to be chosen: price, speed, quality, convenience, specialism…',
        required: true,
        maxLength: 1000,
        rows: 5,
        question: 4,
        questionTitle: 'Target customer and your reason to be chosen',
      },
      {
        id: 'revenueModel',
        type: 'select',
        label: 'How will you charge?',
        required: true,
        options: REVENUE_MODELS,
        placeholder: 'Choose one',
        question: 5,
        questionTitle: 'Revenue model and expected selling price',
      },
      {
        id: 'priceEstimate',
        type: 'estimate',
        unit: 'currency',
        label: 'Expected price per sale',
        help: 'What one customer would pay for one purchase, subscription month, or project.',
        required: true,
        unknownLabel: 'Not sure',
        min: 0,
        question: 5,
      },
      {
        id: 'budget',
        type: 'estimate',
        unit: 'currency',
        label: 'Budget you could invest',
        required: true,
        unknownLabel: 'Not sure',
        min: 0,
        question: 6,
        questionTitle: 'Founder resources',
        questionHelp: 'Budget, time and experience, so the report can judge fit.',
      },
      {
        id: 'hoursPerWeek',
        type: 'select',
        label: 'Time per week',
        required: true,
        options: HOURS,
        placeholder: 'Choose a range',
        question: 6,
      },
      {
        id: 'experience',
        type: 'select',
        label: 'Relevant experience',
        required: true,
        options: EXPERIENCE,
        placeholder: 'Choose one',
        question: 6,
      },
    ],
  },
  {
    id: 'progress',
    shortTitle: 'Delivery',
    title: 'Progress and delivery',
    intro: 'Last two questions: where you are, and where to send the report.',
    fields: [
      {
        id: 'stage',
        type: 'select',
        label: 'Current stage',
        required: true,
        options: STAGES,
        placeholder: 'Choose one',
        question: 7,
        questionTitle: 'Current stage and validation so far',
      },
      {
        id: 'validation',
        type: 'checkbox-group',
        label: 'Validation already attempted',
        required: true,
        options: VALIDATION,
        question: 7,
      },
      {
        id: 'evidenceDetail',
        type: 'textarea',
        label: 'Evidence so far (optional)',
        help: 'Numbers, dates, what people actually said or did.',
        maxLength: 600,
        rows: 3,
        question: 7,
        showIf: (a) => {
          const v = asArray(a.validation);
          return v.length > 0 && !(v.length === 1 && v[0] === 'none');
        },
      },
      {
        id: 'email',
        type: 'email',
        label: 'Email address for the report',
        help: 'Your private report link goes here. No account is created.',
        required: true,
        placeholder: 'you@example.com',
        question: 8,
        questionTitle: 'Where should we send the report?',
      },
      {
        id: 'ackScope',
        type: 'checkbox',
        label: 'Acknowledgement: scope of the report',
        required: true,
        statement: 'I understand the report is desk research and general guidance for one idea in one primary market, not financial, legal, tax or investment advice.',
        question: 8,
      },
      {
        id: 'ackTerms',
        type: 'checkbox',
        label: 'Acknowledgement: terms and privacy',
        required: true,
        statement: 'I accept the terms of service, privacy policy and refund policy.',
        question: 8,
      },
    ],
  },
];

export const STEP_COUNT = STEPS.length;
export const QUESTION_COUNT = 8;

export function getStepIndex(stepId: string): number {
  return STEPS.findIndex((s) => s.id === stepId);
}

export function visibleFields(step: Step, answers: Answers) {
  return step.fields.filter((f) => !f.showIf || f.showIf(answers));
}

/** Label lookup for the review page and briefs. Custom combobox values pass through. */
export function optionLabel(field: { options?: { value: string; label: string }[] }, value: string) {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

/** Group a step's visible fields by numbered question, preserving order. */
export function groupByQuestion(fields: Field[]): { number: number | null; title?: string; help?: string; fields: Field[] }[] {
  const groups: { number: number | null; title?: string; help?: string; fields: Field[] }[] = [];
  for (const f of fields) {
    const last = groups[groups.length - 1];
    if (last && last.number !== null && last.number === f.question) {
      last.fields.push(f);
    } else {
      groups.push({ number: f.question ?? null, title: f.questionTitle, help: f.questionHelp, fields: [f] });
    }
  }
  return groups;
}

export function isExistingBusinessV2(answers: Answers): boolean {
  return ['trading-new', 'trading-established'].includes(asString(answers.stage));
}
