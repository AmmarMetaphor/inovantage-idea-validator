/*
  ILLUSTRATIVE SAMPLE. The idea, the customer and every figure are invented
  to show the structure and tone of the standard report. Nothing here is
  research. Where a real report cites a source, this sample shows a bracketed
  placeholder instead of a fabricated statistic. The scores are made up and
  must never be shown as a visitor's assessment.
*/
import type { StandardReport } from '@/components/report/types';
import type { FinancialResult } from '@/lib/api';

const P = (s: string) => `[${s}]`;

export const SAMPLE_MARKET_LABEL = 'United Kingdom';

export const SAMPLE_REPORT: StandardReport = {
  title: 'Northside Mobile Dog Grooming',
  idea_summary: 'Van-based grooming at the owner’s home in north Leeds (fictional).',
  verdict: {
    label: 'Refine before investing',
    explanation: `A promising direction to test. Local demand indicators were ${P('finding with source and date')} and competitors price at ${P('range with source')}; the convenience angle is supported by what owners of anxious dogs said. The income objective needs roughly 75 grooms a month at the stated price and assumed costs, which is tight for the hours available, so the next step is a small deposit-backed demand test before buying a van.`,
  },
  scorecard: [
    { id: 'customer_clarity', score: 74, basis: 'evidence', note: `Owners of anxious or large dogs are named and ${P('local conversations')} support the need.`, improvement: 'Pin down the two postcodes with the most dog owners within a 20-minute drive.' },
    { id: 'market_timing', score: null, basis: 'insufficient', note: 'No local trend data was found for at-home pet services.', improvement: 'Check council licensing changes and two trade bodies for recent local trends.' },
    { id: 'market_entry', score: 58, basis: 'assumption', note: 'Low premises cost, but a van fit-out and qualification are needed before trading.', improvement: 'Get three fit-out quotes and a course end date to firm up the entry cost.' },
    { id: 'differentiation', score: 52, basis: 'assumption', note: 'At-home calm handling is distinct from salons, but two mobile groomers already operate nearby.', improvement: 'Position on anxious-dog handling and show it with reviewed trial grooms.' },
    { id: 'problem_fit', score: 68, basis: 'evidence', note: `Salon stress for anxious dogs is a real, repeated problem ${P('source')}.`, improvement: 'Quantify how often owners groom and what they pay today.' },
    { id: 'mvp_practicality', score: 71, basis: 'assumption', note: 'A hired van and a short booking list test the service before a full fit-out.', improvement: 'Run 20 discounted grooms from a hired van before committing capital.' },
    { id: 'value_proposition', score: 63, basis: 'assumption', note: 'Convenience and calm handling are easy to explain; price premium untested.', improvement: 'Test £45 against £55 with real bookings.' },
    { id: 'feasibility', score: 47, basis: 'assumption', note: 'Break-even is reachable at 18 grooms a month, but the income goal needs about 75.', improvement: 'Decide the travel radius and price travel time into the groom.' },
    { id: 'resource_readiness', score: 55, basis: 'assumption', note: '20–35 hours a week and £8,000 budget fit a hired-van start, not a bought van.', improvement: 'Plan the training end date and launch from it.' },
  ],
  chart: {
    kind: 'scenario',
    title: 'Grooms needed per month',
    unit: 'grooms per month',
    series: [
      { label: 'Break-even', value: 18, source_index: null },
      { label: 'Target at £45', value: 75, source_index: null },
      { label: 'Target at £55', value: 59, source_index: null },
    ],
    note: 'Computed from the fictional inputs below, not from market data. A real report draws an evidence chart only when a source supplies the series; otherwise it labels the scenario or states the data gap.',
  },
  swot: {
    strengths: ['Convenience for owners of anxious dogs', 'Low fixed premises cost'],
    weaknesses: ['No grooming qualification yet', 'Single van, no cover'],
    opportunities: [P('evidence-backed gap, with source')],
    threats: ['Established mobile groomers with reviews'],
  },
  financial_inputs: null,
  risks: [
    { risk: 'Not enough local demand to fill a week.', validation_method: 'Take deposits for 20 first appointments before buying the van.' },
    { risk: 'Skill and reputation with no qualification.', validation_method: 'Complete a recognised course; launch with ten reviewed trial grooms.' },
    { risk: 'Van downtime stops all revenue.', validation_method: 'Price a hire fallback and insurance before committing.' },
  ],
  improvements: [
    { action: 'Replace the unknown start-up cost with three real van fit-out quotes.', purpose: 'The budget decision depends on it.', measure: 'Suggested: three written quotes within two weeks.' },
    { action: 'Decide the travel radius and price travel time into the £45.', purpose: 'Unpaid driving is the biggest hidden cost.', measure: 'Suggested: average drive under 15 minutes per booking.' },
    { action: 'Name the two nearest mobile competitors and position against them.', purpose: 'Owners will compare on reviews and price.', measure: 'Suggested: one clear difference per competitor on the booking page.' },
    { action: 'Plan the training end date and launch from it, not from today.', purpose: 'Trading without a qualification risks reputation.', measure: 'Suggested: course booked with a confirmed end date.' },
    { action: 'Set a minimum monthly volume that would trigger a rethink.', purpose: 'A pre-agreed stop rule prevents sunk-cost decisions.', measure: 'Suggested: under 30 grooms in month three means revisit the plan.' },
  ],
  experiment: {
    description: 'Offer 20 discounted first grooms to local owners via two community groups, with a £10 deposit, from a hired van.',
    budget_amount: 150,
    duration: '4 weeks',
    success_criterion: 'At least 12 deposits paid and 8 grooms completed with a rebooking request (suggested threshold).',
  },
  sources: [
    { index: 1, title: P('Source title'), url: 'https://example.invalid/source-1', publisher: P('publisher'), published_date: P('date'), geography: P('geography'), unit: null, period: null, claim_type: 'historical', used_for: 'local demand indicator' },
    { index: 2, title: P('Source title'), url: 'https://example.invalid/source-2', publisher: P('publisher'), published_date: P('date'), geography: P('geography'), unit: null, period: null, claim_type: 'other', used_for: 'competitor pricing' },
  ],
  limitations: ['No local figure for paid-grooming frequency was found; the base volume is an assumption.', 'Start-up cost was marked “not sure yet” and is assumed pending quotes.'],
  claims: [
    { section_id: 'verdict', text: `Owners of anxious dogs find salon visits stressful ${P('source')}.`, kind: 'evidence', confidence: 'medium', source_indexes: [1], evidence_date: null },
    { section_id: 'financials', text: 'Cost per groom is assumed at £7 for consumables.', kind: 'assumption', confidence: 'low', source_indexes: [], evidence_date: null },
    { section_id: 'financials', text: 'Break-even of 18 grooms a month follows from the stated price and assumed costs.', kind: 'calculation', confidence: 'high', source_indexes: [], evidence_date: null },
  ],
};

/** Mirrors computeFinancials for the fictional inputs: £45 price, £7 cost, £650 fixed, 30/60/90 grooms. */
export const SAMPLE_FIN: FinancialResult = {
  currency: 'GBP',
  complete: true,
  missing: [],
  contributionPerUnit: 38,
  contributionMarginPct: 84.4,
  breakEvenUnits: 18,
  breakEvenNote: '18 sales per month cover fixed costs of £650 at £38 contribution per groom.',
  rows: [
    { label: 'Low', units: 30, revenue: 1350, variableCosts: 210, contribution: 1140, fixedCosts: 650, profit: 490 },
    { label: 'Base', units: 60, revenue: 2700, variableCosts: 420, contribution: 2280, fixedCosts: 650, profit: 1630 },
    { label: 'High', units: 90, revenue: 4050, variableCosts: 630, contribution: 3420, fixedCosts: 650, profit: 2770 },
  ],
  assumptions: [
    { label: 'Price per groom', value: '£45', basis: 'customer_input', note: 'from the questionnaire' },
    { label: 'Cost per groom', value: '£7', basis: 'assumption', note: 'consumables, illustrative' },
    { label: 'Fixed costs per month', value: '£650', basis: 'assumption', note: 'van, insurance, fuel; illustrative' },
    { label: 'Monthly volumes (low / base / high)', value: '30 / 60 / 90', basis: 'assumption', note: 'capacity-based' },
  ],
};
