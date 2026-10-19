/**
 * Product configuration: products, pricing, markets and contact details.
 * Values here are public and safe to ship to the browser. The server reads
 * the same file, so prices and expected Stripe amounts cannot drift.
 */

export type MarketCode = 'UK' | 'US' | 'AU';
export type CurrencyCode = 'GBP' | 'USD' | 'AUD';

export interface Market {
  code: MarketCode;
  label: string;
  currency: CurrencyCode;
  regionLabel: string;
  regionPlaceholder: string;
}

export const MARKETS: Market[] = [
  { code: 'UK', label: 'United Kingdom', currency: 'GBP', regionLabel: 'Region, county or city', regionPlaceholder: 'e.g. Greater Manchester' },
  { code: 'US', label: 'United States', currency: 'USD', regionLabel: 'State, metro area or city', regionPlaceholder: 'e.g. Austin, Texas' },
  { code: 'AU', label: 'Australia', currency: 'AUD', regionLabel: 'State, region or city', regionPlaceholder: 'e.g. Brisbane, Queensland' },
];

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'GBP', symbol: '£', label: 'British pound (GBP)' },
  { code: 'USD', symbol: '$', label: 'US dollar (USD)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian dollar (AUD)' },
];

export function currencySymbol(code: CurrencyCode | string | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '';
}

export function currencyForMarket(code: MarketCode | string | undefined): CurrencyCode {
  return MARKETS.find((m) => m.code === code)?.currency ?? 'GBP';
}

/* ---------------------------------------------------------------------------
   Products. Two one-time purchases. The upgrade is ADDITIONAL to the standard
   report: a customer who buys both spends £51 in total.
--------------------------------------------------------------------------- */

export type ProductId = 'standard' | 'upgrade';

export interface Product {
  id: ProductId;
  name: string;
  shortName: string;
  /** Minor units (pence). Verified server-side against every Stripe session. */
  amountMinor: number;
  currency: CurrencyCode;
  display: string;
  /** Customer-facing qualifier shown next to the price. */
  priceNote: string;
  description: string;
  /** Environment variable that holds the Stripe Price ID for this product. */
  stripePriceEnv: 'STRIPE_PRICE_ID_STANDARD' | 'STRIPE_PRICE_ID_UPGRADE';
  requires: ProductId | null;
}

export const PRODUCTS: Record<ProductId, Product> = {
  standard: {
    id: 'standard',
    name: 'Idea Validation Report',
    shortName: 'Standard report',
    amountMinor: 1700,
    currency: 'GBP',
    display: '£17',
    priceNote: 'one-time payment',
    description: 'An evidence-based assessment of one idea in one market: readiness score, factor scorecards, criteria radar, evidence, improvements and the next test, as an interactive web report and a two-page PDF.',
    stripePriceEnv: 'STRIPE_PRICE_ID_STANDARD',
    requires: null,
  },
  upgrade: {
    id: 'upgrade',
    name: 'Detailed Report Upgrade',
    shortName: 'Detailed report',
    amountMinor: 3400,
    currency: 'GBP',
    display: '£34',
    priceNote: 'additional, one-time payment',
    description: 'A detailed report building on your assessment: market insights, market strategy, roadmap, customer journey and financial details.',
    stripePriceEnv: 'STRIPE_PRICE_ID_UPGRADE',
    requires: 'standard',
  },
};

export const PRODUCT_LIST: Product[] = [PRODUCTS.standard, PRODUCTS.upgrade];

/** Combined spend when both are bought, for honest disclosure. */
export const COMBINED_TOTAL = {
  amountMinor: PRODUCTS.standard.amountMinor + PRODUCTS.upgrade.amountMinor,
  display: '£51',
};

/** Convenience alias for the entry product (used in nav and CTAs). */
export const PRICE = {
  amount: PRODUCTS.standard.amountMinor / 100,
  amountMinor: PRODUCTS.standard.amountMinor,
  currency: PRODUCTS.standard.currency,
  display: PRODUCTS.standard.display,
  note: 'One report. One idea. One primary market. No subscription, no account.',
};

/** What the detailed upgrade adds, as shown in the locked preview and pricing. */
export const UPGRADE_INCLUDES = [
  { title: 'Market insights', body: 'Audience segments, demand evidence and competitors.' },
  { title: 'Market strategy', body: 'Positioning, acquisition channels and pricing options.' },
  { title: 'Roadmap', body: 'Prioritised steps and milestones.' },
  { title: 'Customer journey', body: 'Discovery, purchase, delivery and retention.' },
  { title: 'Financial details', body: 'Start-up cost assumptions, unit economics, break-even analysis and clearly labelled scenarios.' },
] as const;

/** Sections generated in the detailed report (nine fixed section ids in the generator). */
export const DETAILED_REPORT_SECTIONS = [
  'Market opportunity and sizing methodology',
  'Target customer segments',
  'Competitor comparison and positioning',
  'Pricing and route to market',
  'Start-up and operating-cost assumptions',
  'Revenue, cash-flow and break-even scenarios',
  'Sensitivity analysis and principal risks',
  'Prioritised launch and validation roadmap',
  'Supporting sources and limitations',
] as const;

/** Delivery promise: honest progress, no fixed turnaround. */
export const DELIVERY_COPY = {
  short: 'We’ll email you when your report is ready.',
  long: 'Your report is researched and written after payment. You can watch real progress on your private report page, and we’ll email you when it is ready.',
};

export const COMPANY = {
  name: 'Inovantage',
  productName: 'Idea Validator',
  supportEmail: 'support@inovantage.co.uk',
};

export const CONSULTATION = {
  text: 'For tailored market research, business planning or financial feasibility support, book a consultation with our team at support@inovantage.co.uk.',
  email: 'support@inovantage.co.uk',
  /** Build a mailto link with a non-sensitive report reference in the subject. */
  mailto(reportRef?: string): string {
    const subject = reportRef ? `Consultation request (report ${reportRef})` : 'Consultation request';
    return `mailto:${CONSULTATION.email}?subject=${encodeURIComponent(subject)}`;
  },
};

/** Scoring model (criteria, weights, bands): see scoring.ts. Re-exported for convenience. */
export { CRITERIA, SCORE_DISCLAIMER, SCORE_LABEL, SCORE_RUBRIC } from './scoring';
