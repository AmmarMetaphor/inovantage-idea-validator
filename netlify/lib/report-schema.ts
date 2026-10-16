/*
  APPLICATION report model: what is stored in reports.content and what the
  PDF renderers, the web report and the claims ledger read. Editorial limits
  live here and are enforced server-side.

  This schema is NOT sent to Anthropic. Generation uses the compact shapes in
  generation-schema.ts, which are mapped into this model explicitly.
*/
import { z } from 'zod';

export const VERDICTS = ['Worth testing', 'Refine before investing', 'Reconsider the current approach'] as const;
export type VerdictLabel = (typeof VERDICTS)[number];

export const SCORECARD_IDS = ['demand', 'competition', 'differentiation', 'financial_clarity', 'founder_fit'] as const;

const Basis = z.enum(['customer_input', 'assumption', 'evidence']);

/** A retrievable source with the provenance detail needed for statistics. */
export const SourceSchema = z.object({
  index: z.number().int().min(1).max(12),
  title: z.string().min(1).max(110),
  url: z.string().min(8).max(300),
  publisher: z.string().max(60).nullable(),
  /** Publication or data date as printed by the source, or null. */
  published_date: z.string().max(30).nullable(),
  geography: z.string().max(40).nullable(),
  unit: z.string().max(40).nullable(),
  period: z.string().max(40).nullable(),
  claim_type: z.enum(['historical', 'forecast', 'other']),
  /** What this source was used for, one short clause. */
  used_for: z.string().max(120),
});

export const ClaimSchema = z.object({
  section_id: z.string().min(1).max(40),
  text: z.string().min(1).max(320),
  kind: z.enum(['evidence', 'assumption', 'customer_input', 'calculation']),
  confidence: z.enum(['high', 'medium', 'low']),
  /** Indexes into sources; required (non-empty) for evidence claims. */
  source_indexes: z.array(z.number().int().min(1).max(12)).max(4),
  evidence_date: z.string().max(40).nullable(),
});

export const ScorecardItemSchema = z.object({
  id: z.enum(SCORECARD_IDS),
  /** 1 (weak) to 5 (strong), or null when evidence is insufficient. */
  score: z.number().int().min(1).max(5).nullable(),
  /** ≤ 18 words. */
  note: z.string().min(1).max(130),
});

export const ChartSchema = z.object({
  /** evidence = real figures from sources; scenario = our labelled illustration; none = data gap. */
  kind: z.enum(['evidence', 'scenario', 'none']),
  title: z.string().max(80),
  unit: z.string().max(30),
  series: z.array(z.object({ label: z.string().max(24), value: z.number(), source_index: z.number().int().min(1).max(12).nullable() })).max(6),
  /** For 'none': the data gap. For 'scenario': the basis. For 'evidence': period/geography. */
  note: z.string().max(200),
});

const ShortList = (max: number) => z.array(z.string().min(1).max(90)).max(max);

export const StandardReportSchema = z.object({
  title: z.string().min(1).max(80),
  /** One line: what the business is, ≤ 20 words. */
  idea_summary: z.string().min(1).max(160),
  verdict: z.object({
    label: z.enum(VERDICTS),
    /** ≤ 85 words, evidence-based, plain English. */
    explanation: z.string().min(1).max(600),
  }),
  scorecard: z.array(ScorecardItemSchema).length(5),
  chart: ChartSchema,
  swot: z.object({ strengths: ShortList(3), weaknesses: ShortList(3), opportunities: ShortList(3), threats: ShortList(3) }),
  financial_inputs: z.object({
    price: z.object({ value: z.number().nullable(), unit: z.string().max(30), basis: Basis, note: z.string().max(120) }),
    variable_cost: z.object({ value: z.number().nullable(), unit: z.string().max(30), basis: Basis, note: z.string().max(120) }),
    fixed_monthly: z.object({ value: z.number().nullable(), basis: Basis, note: z.string().max(120) }),
    volumes: z.object({ low: z.number().min(0), base: z.number().min(0), high: z.number().min(0), basis: Basis, note: z.string().max(160) }),
  }),
  /** Up to three risks; the generator is asked for exactly three. */
  risks: z.array(z.object({ risk: z.string().min(1).max(110), validation_method: z.string().min(1).max(130) })).min(1).max(3),
  /** Three to five specific, prioritised improvements, ≤ 22 words each. */
  improvements: z.array(z.string().min(1).max(150)).min(3).max(5),
  experiment: z.object({
    description: z.string().min(1).max(220),
    budget_amount: z.number().min(0),
    duration: z.string().max(40),
    success_criterion: z.string().min(1).max(160),
  }),
  sources: z.array(SourceSchema).max(8),
  /** What could not be found or verified. */
  limitations: z.array(z.string().min(1).max(130)).min(1).max(4),
  claims: z.array(ClaimSchema).max(30),
});
export type StandardReport = z.infer<typeof StandardReportSchema>;

/* ---- Detailed report (upgrade) ------------------------------------------ */

export const DETAILED_SECTION_IDS = [
  'market_opportunity',
  'customer_segments',
  'competitors',
  'pricing_route_to_market',
  'cost_assumptions',
  'financial_scenarios',
  'sensitivity_risks',
  'roadmap',
  'sources_limitations',
] as const;

export const DetailedSectionSchema = z.object({
  id: z.enum(DETAILED_SECTION_IDS),
  heading: z.string().min(1).max(90),
  paragraphs: z.array(z.string().max(1500)).max(8),
  bullets: z.array(z.string().max(300)).max(12),
  table: z.object({ columns: z.array(z.string().max(40)).min(2).max(6), rows: z.array(z.array(z.string().max(120)).max(6)).max(14) }).nullable(),
});

export const DetailedReportSchema = z.object({
  title: z.string().min(1).max(80),
  executive_summary: z.array(z.string().min(1).max(260)).min(3).max(7),
  sections: z.array(DetailedSectionSchema).length(9),
  financial_inputs: StandardReportSchema.shape.financial_inputs,
  sensitivity: z.array(z.object({ change: z.string().max(80), effect: z.string().max(160) })).max(8),
  sources: z.array(SourceSchema).max(12),
  limitations: z.array(z.string().min(1).max(200)).min(1).max(8),
  claims: z.array(ClaimSchema).max(80),
});
export type DetailedReport = z.infer<typeof DetailedReportSchema>;

export const DISCLAIMER =
  'This report is desk research and general guidance for one idea in one primary market. It is not financial, legal, tax or investment advice, does not guarantee any outcome, and does not state a probability of business success. Figures marked as assumptions were not verified.';

/** Verdict colour tokens are paired with text labels; never colour alone. */
export const VERDICT_TONE: Record<VerdictLabel, 'go' | 'caution' | 'stop'> = {
  'Worth testing': 'go',
  'Refine before investing': 'caution',
  'Reconsider the current approach': 'stop',
};

export function scoreLabel(score: number | null): string {
  if (score === null) return 'Insufficient evidence';
  return ['', 'Weak', 'Limited', 'Moderate', 'Good', 'Strong'][score] ?? '';
}
