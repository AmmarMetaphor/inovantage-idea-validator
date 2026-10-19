import { MARKETS } from '../config/product';
import { asString } from './helpers';
import type { Answers, Field, Step } from './types';

/*
  Version 3 questionnaire: eight numbered questions over three short screens.
  Fields sharing a `question` number render as one compact question. Required
  answers are kept to the minimum the research needs; uncertainty is allowed
  ("Not sure yet") and is reported as a gap, never blocked.

  schema-v2.ts and schema-v1.ts keep the earlier shapes so reports for
  existing submissions can still be built.
*/

export const ANSWERS_VERSION = 3;

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
  { value: 'preparing', label: 'Preparing to launch' },
  { value: 'trading', label: 'Already trading' },
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

export const STEPS: Step[] = [
  {
    id: 'idea',
    shortTitle: 'Your idea',
    title: 'Tell us about your idea',
    intro: 'Three short questions. Plain language is fine; specifics beat polish.',
    fields: [
      {
        id: 'ideaDescription',
        type: 'textarea',
        label: 'What is your business idea?',
        help: 'What you would sell and how it works. Two to five sentences is plenty.',
        placeholder: 'e.g. A mobile dog-grooming van that visits owners at home in north Leeds.',
        required: true,
        maxLength: 1200,
        rows: 4,
        question: 1,
        questionTitle: 'Your business idea',
      },
      {
        id: 'ideaName',
        type: 'text',
        label: 'Working name',
        maxLength: 80,
        placeholder: 'e.g. Northside Mobile Dog Grooming',
        question: 1,
      },
      {
        id: 'targetCustomer',
        type: 'textarea',
        label: 'Who would buy it, and what problem does it solve?',
        help: 'Describe a typical buyer and the pain or need you meet for them.',
        placeholder: 'e.g. Owners of anxious or large dogs who find salon visits stressful and time-consuming.',
        required: true,
        maxLength: 1000,
        rows: 4,
        question: 2,
        questionTitle: 'Who it is for and the problem it solves',
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
        question: 3,
        questionTitle: 'Which industry best describes it?',
      },
    ],
  },
  {
    id: 'market',
    shortTitle: 'Market and money',
    title: 'Where, how, and why you',
    intro: 'Rough answers are fine. “Not sure yet” is a valid answer and the report will say what was assumed.',
    fields: [
      {
        id: 'country',
        type: 'radio',
        label: 'Country',
        required: true,
        options: MARKETS.map((m) => ({ value: m.code, label: m.label })),
        question: 4,
        questionTitle: 'Where will you launch?',
        questionHelp: 'One report covers one primary market. A city or region makes the research more local.',
      },
      {
        id: 'regionCity',
        type: 'text',
        label: 'City or region',
        maxLength: 120,
        placeholder: 'e.g. Leeds',
        question: 4,
      },
      {
        id: 'differentiation',
        type: 'textarea',
        label: 'What makes your approach different?',
        help: 'Price, speed, quality, convenience, specialism, access to customers… Leave blank or write “Not sure yet” if you have not decided.',
        placeholder: 'e.g. Calm one-to-one handling at home; most local groomers are salon-based.',
        maxLength: 600,
        rows: 3,
        question: 5,
        questionTitle: 'What makes your approach different?',
      },
      {
        id: 'revenueModel',
        type: 'select',
        label: 'How would you earn money?',
        required: true,
        options: REVENUE_MODELS,
        placeholder: 'Choose one',
        question: 6,
        questionTitle: 'How would you earn money?',
      },
      {
        id: 'priceEstimate',
        type: 'estimate',
        unit: 'currency',
        label: 'Intended price per sale',
        help: 'What one customer would pay for one purchase, subscription month, or project.',
        unknownLabel: 'Not sure yet',
        min: 0,
        question: 6,
      },
    ],
  },
  {
    id: 'resources',
    shortTitle: 'You and delivery',
    title: 'What you have to start with',
    intro: 'Last two questions: your resources, and where to send the report.',
    fields: [
      {
        id: 'budget',
        type: 'estimate',
        unit: 'currency',
        label: 'Budget you could invest',
        required: true,
        unknownLabel: 'Not sure yet',
        min: 0,
        question: 7,
        questionTitle: 'What do you have to start with?',
        questionHelp: 'Budget, time and experience, so the report can judge fit. Nothing here is a test.',
      },
      {
        id: 'hoursPerWeek',
        type: 'select',
        label: 'Time per week',
        required: true,
        options: HOURS,
        placeholder: 'Choose a range',
        question: 7,
      },
      {
        id: 'experience',
        type: 'select',
        label: 'Relevant experience',
        required: true,
        options: EXPERIENCE,
        placeholder: 'Choose one',
        question: 7,
      },
      {
        id: 'stage',
        type: 'radio',
        label: 'Where are you now?',
        required: true,
        options: STAGES,
        question: 7,
      },
      {
        id: 'progressNote',
        type: 'textarea',
        label: 'Progress so far',
        help: 'Anything you have already done or learned: conversations, sign-ups, sales, quotes, qualifications.',
        placeholder: 'e.g. Spoke to 12 owners at the park; 5 said they would book.',
        maxLength: 600,
        rows: 3,
        question: 7,
      },
      {
        id: 'email',
        type: 'email',
        label: 'Email address for the report',
        help: 'Your private report link goes here. No account is created.',
        required: true,
        placeholder: 'you@example.com',
        question: 8,
        questionTitle: 'Where should we email your report?',
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

/** Whether the customer already trades (any schema version). */
export function isExistingBusinessV3(answers: Answers): boolean {
  return ['trading', 'trading-new', 'trading-established'].includes(asString(answers.stage));
}
