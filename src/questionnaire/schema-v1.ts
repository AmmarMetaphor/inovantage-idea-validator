import { CURRENCIES, MARKETS } from '../config/product';
import { asString, isExistingBusiness } from './helpers';
import type { Step } from './types';

/* ---------------------------------------------------------------------------
   Option lists
--------------------------------------------------------------------------- */

const INDUSTRIES = [
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
  { value: 'other', label: 'Something else' },
];

const STAGES = [
  { value: 'idea', label: 'Just an idea', hint: 'Nothing built or tested yet.' },
  { value: 'planning', label: 'Researching and planning', hint: 'Exploring, no spend committed.' },
  { value: 'building', label: 'Building before launch', hint: 'Product, premises or setup in progress.' },
  {
    value: 'trading-new',
    label: 'Recently launched',
    hint: 'Trading for under 12 months.',
  },
  {
    value: 'trading-established',
    label: 'Existing business',
    hint: 'Trading over a year; this idea is a new offer or expansion.',
  },
];

const HOURS = [
  { value: 'lt5', label: 'Under 5 hours' },
  { value: '5-10', label: '5 to 10 hours' },
  { value: '10-20', label: '10 to 20 hours' },
  { value: '20-35', label: '20 to 35 hours' },
  { value: '35plus', label: '35 hours or more (full time)' },
];

const INDUSTRY_EXPERIENCE = [
  { value: 'none', label: 'None in this industry' },
  { value: 'some', label: 'Some (worked in or around it)' },
  { value: 'substantial', label: 'Substantial (several years, senior or specialist)' },
];

const FOUNDER_EXPERIENCE = [
  { value: 'first', label: 'This would be my first business' },
  { value: 'one', label: 'I have run one business before' },
  { value: 'several', label: 'I have run several businesses' },
];

const INCOME_OBJECTIVES = [
  { value: 'side', label: 'Side income alongside other work' },
  { value: 'replace', label: 'Replace my current income' },
  { value: 'grow', label: 'Build a business bigger than one income' },
  { value: 'other', label: 'Something else (explain in constraints)' },
];

const TIMEFRAMES = [
  { value: 'lt3', label: 'Within 3 months' },
  { value: '3-6', label: '3 to 6 months' },
  { value: '6-12', label: '6 to 12 months' },
  { value: '12plus', label: 'More than 12 months' },
  { value: 'flexible', label: 'No fixed timeframe' },
];

const REVENUE_MODELS = [
  { value: 'one-off', label: 'One-off sales' },
  { value: 'subscription', label: 'Subscription or membership' },
  { value: 'time', label: 'Hourly or day rate' },
  { value: 'project', label: 'Project or package fees' },
  { value: 'commission', label: 'Commission or marketplace fees' },
  { value: 'advertising', label: 'Advertising or sponsorship' },
  { value: 'mixed', label: 'A mix of the above' },
  { value: 'unsure', label: 'Not sure yet' },
];

const PRICE_BASIS = [
  { value: 'per-unit', label: 'Per item or unit' },
  { value: 'per-hour', label: 'Per hour' },
  { value: 'per-day', label: 'Per day' },
  { value: 'per-month', label: 'Per month' },
  { value: 'per-project', label: 'Per project or package' },
  { value: 'per-customer', label: 'Per customer, all in' },
];

const CHANNELS = [
  { value: 'word-of-mouth', label: 'Word of mouth and referrals' },
  { value: 'social', label: 'Social media (organic)' },
  { value: 'paid-ads', label: 'Paid advertising' },
  { value: 'seo-content', label: 'Search and content' },
  { value: 'partnerships', label: 'Partnerships or resellers' },
  { value: 'outreach', label: 'Direct sales or outreach' },
  { value: 'marketplaces', label: 'Marketplaces or directories' },
  { value: 'events', label: 'Events, markets or local presence' },
  { value: 'existing-customers', label: 'Existing customer base' },
  { value: 'unsure', label: 'Not sure yet' },
];

const DEMAND_EVIDENCE = [
  { value: 'none', label: 'No evidence yet' },
  { value: 'conversations', label: 'Conversations with potential customers' },
  { value: 'survey', label: 'Survey or research responses' },
  { value: 'waitlist', label: 'Waiting list or sign-ups' },
  { value: 'preorders', label: 'Pre-orders or deposits' },
  { value: 'paying', label: 'Paying customers already' },
  { value: 'pilot', label: 'Pilot, trial or test sales' },
];

const CUSTOMER_TYPES = [
  { value: 'b2c', label: 'Consumers (B2C)', hint: 'Individuals and households.' },
  { value: 'b2b', label: 'Businesses (B2B)', hint: 'Companies, organisations or professionals.' },
  { value: 'both', label: 'Both' },
];

const SERVICE_AREAS = [
  { value: 'local', label: 'Local', hint: 'One town, city or neighbourhood.' },
  { value: 'regional', label: 'Regional', hint: 'A county, state or wider area.' },
  { value: 'national', label: 'National', hint: 'Across the whole country.' },
  { value: 'online', label: 'Online or anywhere', hint: 'Location is not a factor.' },
];

/* ---------------------------------------------------------------------------
   Steps
--------------------------------------------------------------------------- */

/** Version 1 (six-step) questionnaire. Kept so reports for existing submissions can still be built. */
export const STEPS_V1: Step[] = [
  {
    id: 'idea',
    shortTitle: 'Idea',
    title: 'Tell us about the idea',
    intro:
      'Plain language is fine. We use these answers to frame the research, so specifics beat polish.',
    fields: [
      {
        id: 'ideaName',
        type: 'text',
        label: 'Working name for the idea',
        help: 'A product, service or business name. It can change later.',
        required: true,
        maxLength: 80,
        placeholder: 'e.g. Northside Mobile Dog Grooming',
      },
      {
        id: 'ideaSummary',
        type: 'textarea',
        label: 'Describe the idea in a few sentences',
        help: 'What it is, who it is for and how it makes money.',
        required: true,
        maxLength: 800,
        rows: 5,
      },
      {
        id: 'industry',
        type: 'select',
        label: 'Industry',
        required: true,
        options: INDUSTRIES,
        placeholder: 'Choose the closest match',
      },
      {
        id: 'industryOther',
        type: 'text',
        label: 'Which industry?',
        required: true,
        maxLength: 80,
        showIf: (a) => asString(a.industry) === 'other',
      },
      {
        id: 'stage',
        type: 'radio',
        label: 'Where are you with it?',
        required: true,
        options: STAGES,
      },
      {
        id: 'problem',
        type: 'textarea',
        label: 'What problem does it solve, and for whom?',
        help: 'The pain, need or want you are addressing. If it is a “nice to have”, say so.',
        required: true,
        maxLength: 800,
        rows: 4,
      },
      {
        id: 'offer',
        type: 'textarea',
        label: 'What exactly will you sell?',
        help: 'The product or service, what is included and how it is delivered.',
        required: true,
        maxLength: 800,
        rows: 4,
      },
    ],
  },
  {
    id: 'market',
    shortTitle: 'Customer',
    title: 'Your customer and market',
    intro:
      'One report covers one primary market. Choose the country and area you would launch in first.',
    fields: [
      {
        id: 'customerDescription',
        type: 'textarea',
        label: 'Who is your ideal customer?',
        help: 'Describe a typical buyer: situation, needs, budget, anything that makes them a good fit.',
        required: true,
        maxLength: 800,
        rows: 4,
      },
      {
        id: 'customerType',
        type: 'radio',
        label: 'Are you selling to consumers or businesses?',
        required: true,
        options: CUSTOMER_TYPES,
      },
      {
        id: 'country',
        type: 'radio',
        label: 'Primary market',
        help: 'The report is researched for this country only.',
        required: true,
        options: MARKETS.map((m) => ({ value: m.code, label: m.label })),
      },
      {
        id: 'regionCity',
        type: 'text',
        label: 'Region, state or city',
        help: 'Where you would launch first. For an online business, where you are based.',
        required: true,
        maxLength: 120,
        placeholder: 'e.g. Bristol',
      },
      {
        id: 'serviceArea',
        type: 'radio',
        label: 'Service area',
        required: true,
        options: SERVICE_AREAS,
      },
      {
        id: 'alternatives',
        type: 'textarea',
        label: 'What do these customers do today instead?',
        help: 'Existing providers, workarounds, doing nothing. Honest answers make the research sharper.',
        required: true,
        maxLength: 800,
        rows: 4,
      },
    ],
  },
  {
    id: 'pricing',
    shortTitle: 'Pricing',
    title: 'Pricing and competition',
    intro: 'Rough numbers are fine. If you genuinely do not know yet, say so and we will estimate.',
    fields: [
      {
        id: 'currency',
        type: 'select',
        label: 'Currency for your figures',
        help: 'Defaults to your primary market. All money questions use this currency.',
        required: true,
        options: CURRENCIES.map((c) => ({ value: c.code, label: c.label })),
      },
      {
        id: 'priceEstimate',
        type: 'estimate',
        unit: 'currency',
        label: 'Expected price',
        help: 'What a customer would pay for one purchase.',
        required: true,
        placeholder: '0',
        min: 0,
      },
      {
        id: 'priceBasis',
        type: 'select',
        label: 'That price is…',
        required: true,
        options: PRICE_BASIS,
        placeholder: 'Choose a basis',
        showIf: (a) => {
          const p = a.priceEstimate;
          return !(typeof p === 'object' && p !== null && 'unknown' in p && p.unknown);
        },
      },
      {
        id: 'revenueModel',
        type: 'select',
        label: 'Revenue model',
        required: true,
        options: REVENUE_MODELS,
        placeholder: 'Choose the closest match',
      },
      {
        id: 'competitors',
        type: 'textarea',
        label: 'Competitors or alternatives you know of',
        help: 'Up to five names or links. Write “none known” if you have not found any.',
        required: true,
        maxLength: 600,
        rows: 3,
      },
      {
        id: 'differentiation',
        type: 'textarea',
        label: 'Why would a customer choose you?',
        help: 'Price, speed, quality, convenience, specialism, location, relationships…',
        required: true,
        maxLength: 800,
        rows: 4,
      },
    ],
  },
  {
    id: 'circumstances',
    shortTitle: 'You',
    title: 'Your circumstances',
    intro:
      'Feasibility depends on the person, not just the idea. These answers stay confidential and shape the recommendations.',
    fields: [
      {
        id: 'capital',
        type: 'estimate',
        unit: 'currency',
        label: 'Capital you could invest',
        help: 'Money you could realistically commit without borrowing. Include a borrowing figure in constraints if relevant.',
        required: true,
        min: 0,
      },
      {
        id: 'hoursPerWeek',
        type: 'select',
        label: 'Hours per week you can give this',
        required: true,
        options: HOURS,
        placeholder: 'Choose a range',
      },
      {
        id: 'industryExperience',
        type: 'select',
        label: 'Experience in this industry',
        required: true,
        options: INDUSTRY_EXPERIENCE,
        placeholder: 'Choose one',
      },
      {
        id: 'founderExperience',
        type: 'select',
        label: 'Experience running a business',
        required: true,
        options: FOUNDER_EXPERIENCE,
        placeholder: 'Choose one',
      },
      {
        id: 'teamAssets',
        type: 'textarea',
        label: 'Who else is involved, and what do you already have?',
        help: 'Co-founders, staff, suppliers, premises, equipment, audience, qualifications, licences.',
        maxLength: 800,
        rows: 4,
      },
      {
        id: 'incomeObjective',
        type: 'select',
        label: 'What is the income objective?',
        required: true,
        options: INCOME_OBJECTIVES,
        placeholder: 'Choose one',
      },
      {
        id: 'incomeTarget',
        type: 'estimate',
        unit: 'currency',
        suffix: 'per year',
        label: 'Target personal income from this',
        help: 'Before tax. We use it to check whether the idea can realistically pay you.',
        min: 0,
      },
      {
        id: 'timeframe',
        type: 'select',
        label: 'When do you want to launch (or expand)?',
        required: true,
        options: TIMEFRAMES,
        placeholder: 'Choose one',
      },
      /* Conditional block for existing businesses */
      {
        id: 'existingRevenue',
        type: 'estimate',
        unit: 'currency',
        suffix: 'per month',
        label: 'Current revenue',
        help: 'Average monthly sales for the existing business.',
        required: true,
        min: 0,
        sectionHeading: 'Your existing business',
        sectionIntro:
          'Because you already trade, a few extra questions help us assess the new idea against what you have today.',
        showIf: isExistingBusiness,
      },
      {
        id: 'existingCosts',
        type: 'estimate',
        unit: 'currency',
        suffix: 'per month',
        label: 'Current total costs',
        help: 'Everything the business spends in a typical month.',
        required: true,
        min: 0,
        showIf: isExistingBusiness,
      },
      {
        id: 'existingCustomers',
        type: 'estimate',
        unit: 'count',
        label: 'Active customers',
        help: 'Roughly how many customers bought from you in the last 3 months.',
        required: true,
        min: 0,
        showIf: isExistingBusiness,
      },
      {
        id: 'expansionPlans',
        type: 'textarea',
        label: 'How does this idea fit your existing business?',
        help: 'New product line, new location, new customer type, pivot… and whether it shares staff, premises or brand.',
        required: true,
        maxLength: 800,
        rows: 4,
        showIf: isExistingBusiness,
      },
    ],
  },
  {
    id: 'costs',
    shortTitle: 'Costs',
    title: 'Costs and demand',
    intro:
      'Three cost estimates and how you expect customers to find you. “I don’t know yet” is a valid answer; we will research typical figures.',
    fields: [
      {
        id: 'startupCosts',
        type: 'estimate',
        unit: 'currency',
        label: 'One-off start-up costs',
        help: 'Equipment, stock, setup, legal, website, deposits.',
        required: true,
        min: 0,
      },
      {
        id: 'fixedCosts',
        type: 'estimate',
        unit: 'currency',
        suffix: 'per month',
        label: 'Fixed monthly costs',
        help: 'Rent, software, insurance, salaries, loan repayments.',
        required: true,
        min: 0,
      },
      {
        id: 'perSaleCost',
        type: 'estimate',
        unit: 'currency',
        suffix: 'per sale',
        label: 'Cost per sale',
        help: 'Materials, time, fees or delivery for one unit of what you sell.',
        required: true,
        min: 0,
      },
      {
        id: 'acquisitionChannels',
        type: 'checkbox-group',
        label: 'How will customers find you?',
        help: 'Choose everything you plan to use.',
        required: true,
        options: CHANNELS,
      },
      {
        id: 'acquisitionPlan',
        type: 'textarea',
        label: 'Anything more on the acquisition plan?',
        help: 'Budget, timing, first 10 customers, partners you already have.',
        maxLength: 800,
        rows: 3,
      },
      {
        id: 'demandEvidence',
        type: 'checkbox-group',
        label: 'What evidence of demand do you have?',
        required: true,
        options: DEMAND_EVIDENCE,
      },
      {
        id: 'demandEvidenceDetail',
        type: 'textarea',
        label: 'Tell us about that evidence',
        help: 'Numbers, dates, what people actually said or did.',
        maxLength: 800,
        rows: 3,
        showIf: (a) => {
          const v = a.demandEvidence;
          return Array.isArray(v) && v.length > 0 && !(v.length === 1 && v[0] === 'none');
        },
      },
    ],
  },
  {
    id: 'final',
    shortTitle: 'Finish',
    title: 'Final details',
    intro: 'Last step. Tell us what worries you, where to send the report, and confirm a few things.',
    fields: [
      {
        id: 'constraints',
        type: 'textarea',
        label: 'Anything that limits your options?',
        help: 'Visa or work restrictions, health, caring duties, location, licences, non-compete clauses, debt.',
        maxLength: 800,
        rows: 4,
      },
      {
        id: 'biggestConcern',
        type: 'textarea',
        label: 'What is your biggest concern about this idea?',
        help: 'We make sure the report addresses it directly.',
        required: true,
        maxLength: 600,
        rows: 3,
      },
      {
        id: 'email',
        type: 'email',
        label: 'Email address for the report',
        help: 'Your report link and PDF go here. No account is created.',
        required: true,
        placeholder: 'you@example.com',
      },
      {
        id: 'ackScope',
        type: 'checkbox',
        label: 'Acknowledgement: scope of the report',
        required: true,
        statement:
          'I understand the report is desk research and general guidance for one idea in one primary market. It is not financial, legal, tax or investment advice.',
        sectionHeading: 'Required acknowledgements',
      },
      {
        id: 'ackAccuracy',
        type: 'checkbox',
        label: 'Acknowledgement: accuracy of answers',
        required: true,
        statement:
          'The answers I have given are accurate to the best of my knowledge. Estimates marked as unknown will be researched and assumed.',
      },
      {
        id: 'ackTerms',
        type: 'checkbox',
        label: 'Acknowledgement: terms and privacy',
        required: true,
        statement: 'I accept the terms of service, privacy policy and refund policy.',
      },
    ],
  },
];

