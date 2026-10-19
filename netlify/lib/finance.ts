/*
  Financial scenarios computed in code, never by the model.

  Inputs carry explicit units and a basis (customer input, assumption, or
  evidence). Money is in major units of `currency` (e.g. pounds). Contribution
  margins of zero or below are handled explicitly: break-even is then
  unreachable at that price and the table says so instead of dividing by zero.
*/

export type Basis = 'customer_input' | 'assumption' | 'evidence';

export interface FinancialInputs {
  currency: string;
  /** Selling price per unit (per sale, per month per customer, per project…). */
  price: { value: number | null; unit: string; basis: Basis; note?: string };
  /** Direct cost per unit sold. */
  variableCost: { value: number | null; unit: string; basis: Basis; note?: string };
  /** Fixed costs per month. */
  fixedMonthly: { value: number | null; unit: 'per month'; basis: Basis; note?: string };
  /** Monthly unit volumes to tabulate. */
  volumes: { low: number; base: number; high: number; basis: Basis; note?: string };
}

export interface ScenarioRow {
  label: 'Low' | 'Base' | 'High';
  units: number;
  revenue: number;
  variableCosts: number;
  contribution: number;
  fixedCosts: number;
  profit: number;
}

export interface FinancialResult {
  currency: string;
  complete: boolean;
  missing: string[];
  contributionPerUnit: number | null;
  contributionMarginPct: number | null;
  breakEvenUnits: number | null;
  breakEvenNote: string;
  rows: ScenarioRow[];
  assumptions: { label: string; value: string; basis: Basis; note?: string }[];
}

function fmt(n: number, currency: string): string {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'AUD' ? 'A$' : `${currency} `;
  return `${sym}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n)}`;
}

export function computeFinancials(input: FinancialInputs): FinancialResult {
  const missing: string[] = [];
  if (input.price.value === null) missing.push('selling price');
  if (input.variableCost.value === null) missing.push('cost per sale');
  if (input.fixedMonthly.value === null) missing.push('fixed monthly costs');

  const price = input.price.value ?? 0;
  const vc = input.variableCost.value ?? 0;
  const fixed = input.fixedMonthly.value ?? 0;
  const complete = missing.length === 0;

  const contribution = complete ? price - vc : null;
  const marginPct = contribution !== null && price > 0 ? (contribution / price) * 100 : null;

  let breakEvenUnits: number | null = null;
  let breakEvenNote: string;
  if (!complete) {
    breakEvenNote = `Break-even cannot be computed: ${missing.join(', ')} not provided or evidenced.`;
  } else if (contribution === null || contribution <= 0) {
    breakEvenNote = `Each sale loses money or breaks even before fixed costs (contribution ${fmt(contribution ?? 0, input.currency)} per ${input.price.unit}). Break-even is not reachable at this price; raise the price or cut the cost per sale.`;
  } else {
    breakEvenUnits = Math.ceil(fixed / contribution);
    breakEvenNote = `${breakEvenUnits.toLocaleString('en-GB')} sales per month cover fixed costs of ${fmt(fixed, input.currency)} at ${fmt(contribution, input.currency)} contribution per ${input.price.unit}.`;
  }

  const rows: ScenarioRow[] = (['Low', 'Base', 'High'] as const).map((label) => {
    const units = Math.max(0, Math.round(input.volumes[label.toLowerCase() as 'low' | 'base' | 'high']));
    const revenue = units * price;
    const variableCosts = units * vc;
    const contrib = revenue - variableCosts;
    return { label, units, revenue, variableCosts, contribution: contrib, fixedCosts: fixed, profit: contrib - fixed };
  });

  const assumptions = [
    { label: `Price per ${input.price.unit}`, value: input.price.value === null ? 'not provided' : fmt(price, input.currency), basis: input.price.basis, note: input.price.note },
    { label: `Cost per ${input.variableCost.unit}`, value: input.variableCost.value === null ? 'not provided' : fmt(vc, input.currency), basis: input.variableCost.basis, note: input.variableCost.note },
    { label: 'Fixed costs per month', value: input.fixedMonthly.value === null ? 'not provided' : fmt(fixed, input.currency), basis: input.fixedMonthly.basis, note: input.fixedMonthly.note },
    { label: 'Monthly volumes (low / base / high)', value: `${rows[0].units} / ${rows[1].units} / ${rows[2].units}`, basis: input.volumes.basis, note: input.volumes.note },
  ];

  return { currency: input.currency, complete, missing, contributionPerUnit: contribution, contributionMarginPct: marginPct, breakEvenUnits, breakEvenNote, rows, assumptions };
}

export function formatMoney(n: number, currency: string): string {
  return fmt(n, currency);
}
