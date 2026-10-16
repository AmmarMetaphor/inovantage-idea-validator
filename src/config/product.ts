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
   report: a customer who buys both spends £52 in total.
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
    description: 'A two-page, evidence-based verdict on one idea in one market, with a web report and PDF.',
    stripePriceEnv: 'STRIPE_PRICE_ID_STANDARD',
    requires: null,
  },
  upgrade: {
    id: 'upgrade',
    name: 'Detailed Report Upgrade',
    shortName: 'Detailed report',
    amountMinor: 3500,
    currency: 'GBP',
    display: '£35',
    priceNote: 'additional, one-time payment',
    description: 'A full detailed report building on your standard report: sizing method, segments, competitors, pricing, costs, cash-flow scenarios, sensitivity and a launch roadmap.',
    stripePriceEnv: 'STRIPE_PRICE_ID_UPGRADE',
    requires: 'standard',
  },
};

export const PRODUCT_LIST: Product[] = [PRODUCTS.standard, PRODUCTS.upgrade];

/** Combined spend when both are bought, for honest disclosure. */
export const COMBINED_TOTAL = {
  amountMinor: PRODUCTS.standard.amountMinor + PRODUCTS.upgrade.amountMinor,
  display: '£52',
};

/** Convenience alias for the entry product (used in nav and CTAs). */
export const PRICE = {
  amount: PRODUCTS.standard.amountMinor / 100,
  amountMinor: PRODUCTS.standard.amountMinor,
  currency: PRODUCTS.standard.currency,
  display: PRODUCTS.standard.display,
  note: 'One report. One idea. One primary market. No subscription, no account.',
};

/** Sections included in the detailed report (shown to customers before purchase). */
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
  text: 'For detailed consultation on market research for your product, business planning, and financial feasibility, book a call with our experts by emailing support@inovantage.co.uk.',
  email: 'support@inovantage.co.uk',
  /** Build a mailto link with a non-sensitive report reference in the subject. */
  mailto(reportRef?: string): string {
    const subject = reportRef ? `Consultation request (report ${reportRef})` : 'Consultation request';
    return `mailto:${CONSULTATION.email}?subject=${encodeURIComponent(subject)}`;
  },
};

/** Scorecard rubric for the standard report. Published so scores are explainable. */
export const SCORECARD_DIMENSIONS = [
  { id: 'demand', label: 'Demand', rubric: 'Evidence that the target customers exist locally and want this now.' },
  { id: 'competition', label: 'Competition', rubric: 'How crowded the space is and how entrenched the alternatives are.' },
  { id: 'differentiation', label: 'Differentiation', rubric: 'Whether the stated reason to choose this business is visible and valued.' },
  { id: 'financial_clarity', label: 'Financial clarity', rubric: 'How well the price, costs and break-even are known or evidenced.' },
  { id: 'founder_fit', label: 'Founder fit', rubric: 'Budget, time and experience against what the idea needs.' },
] as const;

export const READINESS_RUBRIC =
  'Indicative readiness score: the average of the five scorecard ratings (1 to 5) scaled to 100, computed in code. Dimensions marked “insufficient evidence” are excluded and the score is withheld if fewer than three dimensions can be rated. It is not a probability of success.';
