import { MARKETS } from '../config/product';
import { asArray, asString } from './helpers';
import type { Answers, Step } from './types';

/*
  Version 2 questionnaire (frozen). Kept so reports for existing submissions
  with answers_version = 2 can still be built. Do not edit; the live
  questionnaire is schema.ts (version 3).
*/

const INDUSTRIES_V2 = [
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

const STAGES_V2 = [
  { value: 'idea', label: 'Just an idea' },
  { value: 'planning', label: 'Researching and planning' },
  { value: 'building', label: 'Building before launch' },
  { value: 'trading-new', label: 'Recently launched (under 12 months)' },
  { value: 'trading-established', label: 'Existing business adding this' },
];

const REVENUE_MODELS_V2 = [
  { value: 'one-off', label: 'One-off sales' },
  { value: 'subscription', label: 'Subscription or membership' },
  { value: 'time', label: 'Hourly or day rate' },
  { value: 'project', label: 'Project or package fees' },
  { value: 'commission', label: 'Commission or marketplace fees' },
  { value: 'advertising', label: 'Advertising or sponsorship' },
  { value: 'mixed', label: 'A mix' },
  { value: 'unsure', label: 'Not sure yet' },
];

const HOURS_V2 = [
  { value: 'lt5', label: 'Under 5 hours a week' },
  { value: '5-10', label: '5 to 10 hours' },
  { value: '10-20', label: '10 to 20 hours' },
  { value: '20-35', label: '20 to 35 hours' },
  { value: '35plus', label: 'Full time (35+)' },
];

const EXPERIENCE_V2 = [
  { value: 'none', label: 'None in this industry' },
  { value: 'some', label: 'Some (worked in or around it)' },
  { value: 'substantial', label: 'Substantial (years, senior or specialist)' },
  { value: 'ran-business', label: 'I have run a business before' },
];

const VALIDATION_V2 = [
  { value: 'none', label: 'Nothing yet' },
  { value: 'conversations', label: 'Talked to potential customers' },
  { value: 'survey', label: 'Survey or research responses' },
  { value: 'waitlist', label: 'Waiting list or sign-ups' },
  { value: 'preorders', label: 'Pre-orders or deposits' },
  { value: 'paying', label: 'Paying customers already' },
  { value: 'pilot', label: 'Pilot, trial or test sales' },
];

export const STEPS_V2: Step[] = [
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
        options: INDUSTRIES_V2,
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
        options: REVENUE_MODELS_V2,
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
        options: HOURS_V2,
        placeholder: 'Choose a range',
        question: 6,
      },
      {
        id: 'experience',
        type: 'select',
        label: 'Relevant experience',
        required: true,
        options: EXPERIENCE_V2,
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
        options: STAGES_V2,
        placeholder: 'Choose one',
        question: 7,
        questionTitle: 'Current stage and validation so far',
      },
      {
        id: 'validation',
        type: 'checkbox-group',
        label: 'Validation already attempted',
        required: true,
        options: VALIDATION_V2,
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


export function isExistingBusinessV2(answers: Answers): boolean {
  return ['trading-new', 'trading-established'].includes(asString(answers.stage));
}
