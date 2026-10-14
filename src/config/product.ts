/**
 * Product configuration: pricing, markets and feature flags.
 * Values here are public and safe to ship to the browser.
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
  {
    code: 'UK',
    label: 'United Kingdom',
    currency: 'GBP',
    regionLabel: 'Region, county or city',
    regionPlaceholder: 'e.g. Greater Manchester',
  },
  {
    code: 'US',
    label: 'United States',
    currency: 'USD',
    regionLabel: 'State, metro area or city',
    regionPlaceholder: 'e.g. Austin, Texas',
  },
  {
    code: 'AU',
    label: 'Australia',
    currency: 'AUD',
    regionLabel: 'State, region or city',
    regionPlaceholder: 'e.g. Brisbane, Queensland',
  },
];

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'GBP', symbol: '£', label: 'British pound (GBP)' },
  { code: 'USD', symbol: '$', label: 'US dollar (USD)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian dollar (AUD)' },
];

export function currencySymbol(code: CurrencyCode | string | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '';
}

/**
 * Working price. Charged once per report, in GBP for all markets for now.
 * The server verifies every payment against amountMinor/currency, so change
 * both here and the Stripe Price together.
 */
export const PRICE = {
  amount: 24,
  amountMinor: 2400,
  currency: 'GBP' as CurrencyCode,
  display: '£24',
  note: 'One report. One idea. One primary market. No subscription, no account.',
};

/** How long a paid report stays retrievable (status page, download, recovery). */
export const REPORT_ACCESS_DAYS = 90;

/** Target turnaround communicated to customers. Keep in sync with copy. */
export const TURNAROUND = {
  label: 'within 2 working days',
};

export const COMPANY = {
  name: 'Inovantage',
  productName: 'Idea Validator',
  supportEmail: 'support@example.com', // placeholder until the real inbox exists
};
