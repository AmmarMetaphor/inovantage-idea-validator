/*
  Representative report fixtures for the four-week journey, the confidence
  layout and the two-page PDF budget. All content is invented test data.
*/
import { buildBrief, stubStandardReport } from '../../netlify/lib/research';
import type { StandardReport } from '../../netlify/lib/report-schema';
import { validAnswers } from '../helpers';

export interface Fixture { name: string; report: StandardReport; marketLabel: string; expectFamily: 'retail' | 'software' | 'services' | 'hospitality' | 'generic' }

function base(over: Record<string, unknown>, ideaName: string, market: 'UK' | 'US' | 'AU' = 'UK') {
  const answers = { ...validAnswers(), ...over };
  const brief = buildBrief({ orderRef: 'FIX00001', market, currency: market === 'US' ? 'USD' : market === 'AU' ? 'AUD' : 'GBP', ideaName, answers, answersVersion: 3 });
  return stubStandardReport(brief);
}

function withPlan(report: StandardReport, weeks: [string, string, string][], caveat = ''): StandardReport {
  return {
    ...report,
    plan: {
      ...report.plan!,
      caveat,
      weeks: report.plan!.weeks.map((w, i) => ({ ...w, action: weeks[i][0], measure: weeks[i][1], detail: weeks[i][2] })),
    },
  };
}

export function fixtures(): Fixture[] {
  const shop = withPlan(
    base({ ideaDescription: 'A small shop and online store selling Pakistani groceries, spices and homeware to families in Bradford.', industry: 'retail-ecommerce', regionCity: 'Bradford', targetCustomer: 'Pakistani and South Asian families who currently travel to Manchester for specific brands.', revenueModel: 'one-off', stage: 'preparing' }, 'Bradford Desi Pantry'),
    [
      ['Interview 12 households at two Bradford mosques and a Saturday market about the brands they cannot buy locally.', 'Brands named more than three times, and what each household spends per month.', 'Fewer than four repeated brands means the gap is narrower than assumed.'],
      ['Choose the 15 products named most often, agree a wholesaler price for each, and set one shelf price.', 'Fifteen products with a cost, a price and a supplier lead time.', 'If three or more cannot be sourced within two weeks, the range needs rethinking.'],
      ['Run a Saturday stall with those 15 products and a WhatsApp pre-order list for the following week.', 'Units sold per product and pre-orders received.', 'Pre-orders show repeat intent; stall sales show walk-in demand.'],
      ['Compare stall sales and pre-orders with the threshold and decide whether to take a short lease.', 'Pre-orders versus 25; products with zero sales.', 'Under the threshold means trial a second market before any lease.'],
    ],
  );
  shop.title = 'Bradford Desi Pantry';
  const software = withPlan(
    base({ ideaDescription: 'A scheduling app for small dental practices.', industry: 'software', regionCity: 'Austin, Texas', targetCustomer: 'Practice managers at 1–3 dentist practices.', revenueModel: 'subscription', stage: 'idea' }, 'ChairTime', 'US'),
    [
      ['Interview eight practice managers in Austin about how they fill last-minute cancellations today.', 'Managers who describe cancellations as a weekly loss, and the tool they use now.', 'Fewer than four means the pain is not frequent enough to pay for.'],
      ['Sketch a three-screen prototype: waitlist, one-tap offer, confirmation.', 'One prototype with three screens and one pricing page.', 'The prototype is the single offer the test week measures.'],
      ['Run five 30-minute usability sessions with the prototype and ask for a paid pilot commitment.', 'Sessions completed; managers who agree to a paid pilot.', 'Agreements to pay are the demand signal, not compliments.'],
      ['Compare pilot commitments with the threshold and decide whether to build the first version.', 'Commitments versus 2.', 'Under two means refine the problem statement before building.'],
    ],
  );
  software.title = 'ChairTime';
  const service = withPlan(
    base({ ideaDescription: 'Bookkeeping for trades businesses.', industry: 'professional-services', targetCustomer: 'Sole-trader electricians and plumbers.', revenueModel: 'subscription', stage: 'trading' }, 'Trades Books'),
    [
      ['Hold ten discovery conversations with sole-trader electricians at a merchant counter about their quarter-end.', 'Hours each spends on paperwork per month, and what they pay an accountant now.', 'Under four hours a month means the service solves a small problem.'],
      ['Define one package: monthly bookkeeping plus quarterly VAT, at one price.', 'A one-page service sheet with scope and price.', 'A single package keeps the pilot comparable.'],
      ['Offer a three-month paid pilot to five trades at the stated price.', 'Pilots started and invoices paid on time.', 'Paid invoices show the price is acceptable.'],
      ['Compare pilots and paid invoices with the threshold and decide whether to take on more clients.', 'Pilots versus 3; late invoices versus 1.', 'Under the threshold means revisit the package or the price.'],
    ],
  );
  service.title = 'Trades Books';
  const limited = base({ ideaDescription: 'A thing.', industry: 'Falconry displays', targetCustomer: 'People', priceEstimate: { value: '', unknown: true }, budget: { value: '', unknown: true }, revenueModel: 'unsure', stage: 'idea' }, 'Evidence-limited idea');
  limited.sources = [];
  limited.scorecard = limited.scorecard.map((s, i) => (i < 5 ? { ...s, score: null, basis: 'insufficient' as const, note: 'Not enough evidence to rate this criterion.' } : s));
  limited.title = 'Evidence-limited idea';
  const longTitle = withPlan(
    base({ ideaDescription: 'Long one.', industry: 'hospitality-tourism', revenueModel: 'one-off' }, 'The Extraordinarily Long Business Name Company For Riverside Tea Rooms'),
    [
      ['Ask forty passing walkers on the riverside path on two weekend mornings what they would stop for, and at what price, with a clipboard and a flask.', 'Walkers asked; those who name a hot drink and a price above £2.80; peak half-hour.', 'Fewer than fifteen means footfall is thinner than the plan assumes and the location needs a second look before any lease.'],
      ['Choose one sample offer: tea, one cake, one takeaway cup; buy only what a weekend needs.', 'One menu card with three items and prices.', 'A narrow offer keeps the trial readable.'],
      ['Run a limited two-weekend pop-up from a gazebo under a temporary licence.', 'Cups sold per hour; cakes sold; takings per weekend.', 'Takings per hour show whether the rent-free trial covers staff time.'],
      ['Compare takings with the threshold and decide whether to approach the landlord.', 'Takings versus £180 per day.', 'Under the threshold means try a different weekday or location.'],
    ],
  );
  longTitle.title = 'The Extraordinarily Long Business Name Company For Riverside Tea Rooms';
  longTitle.improvements = longTitle.improvements.map((r, i) => (i === 0 ? { action: 'Replace the unknown start-up cost with three written quotes for the gazebo, urn, power and temporary event licence before booking any weekend dates.', purpose: 'The whole trial budget depends on the licence cost, which varies by council.', measure: 'Suggested: three quotes and the licence fee confirmed in writing within ten days.' } : r));
  const regulated = withPlan(
    base({ ideaDescription: 'A home-based childminding service for shift workers.', industry: 'personal-services', targetCustomer: 'NHS shift workers with children under five.', revenueModel: 'time', stage: 'idea' }, 'Night Owls Childminding'),
    [
      ['Interview ten shift-working parents at the hospital nursery gate about overnight and early-morning gaps in care.', 'Parents with a weekly gap, and what they pay for cover now.', 'Fewer than four means the gap is rarer than assumed.'],
      ['Choose one service pattern (overnight, two children) and price it; book the registration pre-course.', 'One pattern with a price and the course date.', 'Registration is a precondition, so the pattern must fit its rules.'],
      ['Walk two parents through the setting and the pattern as a simulation; ask for a conditional booking for after registration.', 'Conditional bookings; questions the simulation could not answer.', 'No children are cared for before registration; the conditional bookings are the signal.'],
      ['Compare conditional bookings with the threshold and decide whether to proceed with registration.', 'Conditional bookings versus 2.', 'Under two means refine the pattern before paying registration fees.'],
    ],
    'Childminding requires registration and checks before any child is cared for; weeks three and four use simulations and conditional bookings, not real care.',
  );
  regulated.title = 'Night Owls Childminding';
  return [
    { name: 'retail-pakistani-shop', report: shop, marketLabel: 'United Kingdom', expectFamily: 'retail' },
    { name: 'software', report: software, marketLabel: 'United States', expectFamily: 'software' },
    { name: 'service', report: service, marketLabel: 'United Kingdom', expectFamily: 'services' },
    { name: 'evidence-limited', report: limited, marketLabel: 'United Kingdom', expectFamily: 'generic' },
    { name: 'long-title', report: longTitle, marketLabel: 'United Kingdom', expectFamily: 'hospitality' },
    { name: 'regulated-childminding', report: regulated, marketLabel: 'United Kingdom', expectFamily: 'services' },
  ];
}
