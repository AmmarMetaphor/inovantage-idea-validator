/*
  Scoring model for the standard report. Shared by the browser (web report,
  sample), the PDF renderer and the generation mapping, so the header score,
  the factor bars and the radar always come from the same numbers.

  - Nine criteria in two groups. Every scale points the same way: higher is
    more favourable for the founder.
  - Each criterion is scored 0–100 by the generator with a basis label, or
    marked insufficient (score null). Insufficient criteria are excluded from
    the overall score; they are never treated as zero.
  - The overall "Idea readiness score" is the weighted mean of the scored
    criteria. Weights are published below: the market group and the
    execution group each carry half of the total.
  - The overall score is withheld ("Assessment incomplete") when fewer than
    six criteria are scored or the scored weight is under 60% of the total.
  - Nothing here inflates, floors or rounds up a result.

  This file is imported by server code: relative imports only, no
  import.meta.env.
*/

export type CriterionGroup = 'market' | 'execution';
export type ScoreBasis = 'evidence' | 'assumption' | 'insufficient';

export interface Criterion {
  id: string;
  group: CriterionGroup;
  label: string;
  /** Short label for radar axes and narrow layouts. */
  short: string;
  /** Share of the overall score. Market criteria 10 each (50), execution 12.5 each (50). */
  weight: number;
  /** What a high score means, in one sentence. */
  rubric: string;
}

export const CRITERIA = [
  { id: 'customer_clarity', group: 'market', label: 'Target customer clarity', short: 'Customer', weight: 10, rubric: 'The buyer, their situation and their need are specific and supported by what they say or do.' },
  { id: 'market_timing', group: 'market', label: 'Market timing', short: 'Timing', weight: 10, rubric: 'Conditions in this market now (demand signals, trends, regulation) favour launching rather than waiting.' },
  { id: 'market_entry', group: 'market', label: 'Ease of market entry', short: 'Entry', weight: 10, rubric: 'Few barriers (licences, capital, incumbents, distribution) stand between the founder and first customers.' },
  { id: 'differentiation', group: 'market', label: 'Competitive differentiation', short: 'Differentiation', weight: 10, rubric: 'The stated reason to choose this business is visible, valued and hard for alternatives to copy quickly.' },
  { id: 'problem_fit', group: 'market', label: 'Problem–solution fit', short: 'Problem fit', weight: 10, rubric: 'The offer solves a real, frequent or costly problem for the target customer.' },
  { id: 'mvp_practicality', group: 'execution', label: 'MVP practicality', short: 'MVP', weight: 12.5, rubric: 'A first sellable version can be built and tested cheaply and quickly.' },
  { id: 'value_proposition', group: 'execution', label: 'Value proposition', short: 'Value', weight: 12.5, rubric: 'The benefit is clear, easy to explain and worth the price to the customer.' },
  { id: 'feasibility', group: 'execution', label: 'Initial feasibility', short: 'Feasibility', weight: 12.5, rubric: 'Price, costs and volumes give a credible path to covering fixed costs.' },
  { id: 'resource_readiness', group: 'execution', label: 'Resource readiness', short: 'Resources', weight: 12.5, rubric: 'Budget, time and experience match what the first year needs.' },
] as const satisfies readonly Criterion[];

export type CriterionId = (typeof CRITERIA)[number]['id'];
export const CRITERION_IDS = CRITERIA.map((c) => c.id) as [CriterionId, ...CriterionId[]];
export const TOTAL_WEIGHT = CRITERIA.reduce((n, c) => n + c.weight, 0);

export const GROUPS: { id: CriterionGroup; label: string; intro: string }[] = [
  { id: 'market', label: 'Market factors', intro: 'Whether the right customers exist, can be reached and would choose this.' },
  { id: 'execution', label: 'Execution factors', intro: 'Whether this founder can build, price and sustain it.' },
];

/** Minimum scored criteria and share of weight before an overall score is shown. */
export const OVERALL_RULES = { minCriteria: 6, minWeightShare: 0.6 };

export interface ScoredCriterion {
  id: CriterionId;
  score: number | null;
  basis: ScoreBasis;
}

export interface OverallScore {
  /** 0–100, or null when the assessment is incomplete. */
  score: number | null;
  scored: number;
  total: number;
  /** Share of total weight that could be scored, 0–1. */
  weightShare: number;
  /** Criteria that could not be scored. */
  missing: CriterionId[];
}

/** Weighted mean of the scored criteria; withheld when too little can be scored. */
export function overallScore(items: ScoredCriterion[]): OverallScore {
  const byId = new Map(items.map((i) => [i.id, i]));
  let weighted = 0;
  let weight = 0;
  const missing: CriterionId[] = [];
  for (const c of CRITERIA) {
    const item = byId.get(c.id);
    const s = item?.score;
    if (item && item.basis !== 'insufficient' && typeof s === 'number' && Number.isFinite(s)) {
      weighted += Math.min(100, Math.max(0, s)) * c.weight;
      weight += c.weight;
    } else {
      missing.push(c.id);
    }
  }
  const scored = CRITERIA.length - missing.length;
  const weightShare = weight / TOTAL_WEIGHT;
  const complete = scored >= OVERALL_RULES.minCriteria && weightShare >= OVERALL_RULES.minWeightShare;
  return { score: complete ? Math.round(weighted / weight) : null, scored, total: CRITERIA.length, weightShare, missing };
}

/** Group average of scored criteria (null if none scored), for the two factor cards. */
export function groupScore(items: ScoredCriterion[], group: CriterionGroup): { score: number | null; scored: number; total: number } {
  const ids = CRITERIA.filter((c) => c.group === group).map((c) => c.id);
  const scored = items.filter((i) => ids.includes(i.id) && i.basis !== 'insufficient' && typeof i.score === 'number');
  if (!scored.length) return { score: null, scored: 0, total: ids.length };
  return { score: Math.round(scored.reduce((n, i) => n + (i.score as number), 0) / scored.length), scored: scored.length, total: ids.length };
}

export type Tone = 'strong' | 'moderate' | 'weak' | 'na';

/** Band for a 0–100 score; text always accompanies colour. */
export function scoreTone(score: number | null): Tone {
  if (score === null) return 'na';
  if (score >= 70) return 'strong';
  if (score >= 45) return 'moderate';
  return 'weak';
}

export function scoreWord(score: number | null): string {
  if (score === null) return 'Not enough evidence';
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Moderate';
  if (score >= 45) return 'Limited';
  return 'Weak';
}

/** Constructive headline for the overall score. */
export function overallBand(score: number | null): { title: string; tone: Tone } {
  if (score === null) return { title: 'Assessment incomplete', tone: 'na' };
  if (score >= 70) return { title: 'A promising direction to test', tone: 'strong' };
  if (score >= 45) return { title: 'A stronger niche could improve this opportunity', tone: 'moderate' };
  return { title: 'Start with a small test before committing more', tone: 'weak' };
}

export const SCORE_LABEL = 'Idea readiness score';
export const SCORE_DISCLAIMER = 'A directional assessment of the idea in its current form, not a probability of business success.';

export const SCORE_RUBRIC = `${SCORE_LABEL}: the weighted mean of the nine criterion scores (0 to 100), computed in code. Market factors carry 50% (10 each) and execution factors 50% (12.5 each). Criteria marked "not enough evidence" are excluded rather than scored zero, and the overall score is withheld when fewer than ${OVERALL_RULES.minCriteria} criteria or under ${Math.round(OVERALL_RULES.minWeightShare * 100)}% of the weight can be scored. No minimum, rounding up or adjustment is applied.`;

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface SourceLike { published_date: string | null; geography: string | null; publisher: string | null; claim_type: 'historical' | 'forecast' | 'other' }

/**
 * Source confidence: the quality and relevance of the sources themselves
 * (dated, attributed, with a stated geography). Says nothing about how much
 * of the assessment they cover; see assessmentCoverage.
 */
export function sourceConfidence(sources: SourceLike[]): { level: Confidence; label: string; detail: string } {
  const n = sources.length;
  if (n === 0) return { level: 'none', label: 'No sources', detail: 'No retrievable sources were found; statements rest on assumptions and your answers.' };
  const dated = sources.filter((s) => !!s.published_date).length;
  const attributed = sources.filter((s) => !!s.publisher).length;
  const located = sources.filter((s) => !!s.geography).length;
  const quality = (dated + attributed + located) / (3 * n);
  let level: Confidence = 'low';
  if (n >= 3 && quality >= 0.75) level = 'high';
  else if (n >= 2 && quality >= 0.5) level = 'medium';
  else if (n >= 1 && quality >= 0.5) level = 'medium';
  const label = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low';
  return { level, label, detail: `${n} source${n === 1 ? '' : 's'}: ${dated} dated, ${attributed} attributed, ${located} with a stated geography.` };
}

/**
 * Assessment coverage: how much of the nine-criterion assessment rests on
 * evidence, on assumptions, or could not be scored. A report can cite
 * reliable sources and still have low coverage.
 */
export function assessmentCoverage(items: ScoredCriterion[]): { evidence: number; assumption: number; insufficient: number; total: number; level: Confidence; label: string; detail: string } {
  const evidence = items.filter((i) => i.basis === 'evidence' && i.score !== null).length;
  const assumption = items.filter((i) => i.basis === 'assumption' && i.score !== null).length;
  const insufficient = items.length - evidence - assumption;
  const total = items.length;
  let level: Confidence = 'low';
  if (evidence >= 6) level = 'high';
  else if (evidence >= 3) level = 'medium';
  else if (evidence === 0 && assumption === 0) level = 'none';
  const label = level === 'high' ? 'Mostly evidence-based' : level === 'medium' ? 'Partly evidence-based' : level === 'low' ? 'Mostly assumptions' : 'Not assessed';
  return { evidence, assumption, insufficient, total, level, label, detail: `${evidence} of ${total} criteria evidence-based, ${assumption} assumed, ${insufficient} not enough evidence.` };
}

/** Encouraging, honest framing for the current formulation of the idea. */
export function readinessFraming(score: number | null): { next: string; note: string } {
  if (score === null) return { next: 'Your next step: gather the missing evidence before deciding.', note: 'The criteria marked "not enough evidence" show exactly what to find out first.' };
  if (score >= 70) return { next: 'Your next step: run the first test and record the number.', note: 'A strong starting point; the plan below keeps spending small until the test confirms it.' };
  if (score >= 45) return { next: 'Clarify the weakest assumption before increasing your investment.', note: 'This assessment concerns the idea in its current form; the improvements below are where it can gain most.' };
  return { next: 'Your next step: test a more focused version.', note: 'This assessment concerns the idea in its current form, not your ability to build a business. A smaller launch can help you learn before committing more, and the first recommendation offers a more focused route.' };
}

export function criterion(id: string): Criterion | undefined {
  return CRITERIA.find((c) => c.id === id);
}
