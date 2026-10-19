import { describe, expect, it } from 'vitest';
import { computeFinancials } from '../netlify/lib/finance';

const base = {
  currency: 'GBP',
  price: { value: 45, unit: 'groom', basis: 'customer_input' as const },
  variableCost: { value: 7, unit: 'groom', basis: 'assumption' as const, note: 'illustrative' },
  fixedMonthly: { value: 650, unit: 'per month' as const, basis: 'assumption' as const },
  volumes: { low: 20, base: 60, high: 110, basis: 'assumption' as const },
};

describe('Financial scenarios', () => {
  it('computes contribution, break-even and three rows with explicit units', () => {
    const r = computeFinancials(base);
    expect(r.complete).toBe(true);
    expect(r.contributionPerUnit).toBe(38);
    expect(r.breakEvenUnits).toBe(18);
    expect(r.rows.map((x) => x.profit)).toEqual([20 * 38 - 650, 60 * 38 - 650, 110 * 38 - 650]);
    expect(r.breakEvenNote).toContain('18 sales per month');
    expect(r.assumptions.find((a) => a.label.startsWith('Price'))!.basis).toBe('customer_input');
  });

  it('handles zero and negative contribution margins without dividing by zero', () => {
    const zero = computeFinancials({ ...base, variableCost: { ...base.variableCost, value: 45 } });
    expect(zero.breakEvenUnits).toBeNull();
    expect(zero.breakEvenNote).toMatch(/not reachable/);
    const neg = computeFinancials({ ...base, variableCost: { ...base.variableCost, value: 50 } });
    expect(neg.contributionPerUnit).toBe(-5);
    expect(neg.rows[2].profit).toBeLessThan(neg.rows[0].profit);
  });

  it('reports missing inputs instead of inventing them', () => {
    const r = computeFinancials({ ...base, price: { ...base.price, value: null } });
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['selling price']);
    expect(r.breakEvenUnits).toBeNull();
    expect(r.assumptions[0].value).toBe('not provided');
  });
});
