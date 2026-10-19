/* Mirrors netlify/lib/report-schema.ts for the browser (types only). */
import type { CriterionId, ScoreBasis } from '@/config/scoring';

export type VerdictLabel = 'Worth testing' | 'Refine before investing' | 'Reconsider the current approach';
export type Basis = 'customer_input' | 'assumption' | 'evidence';

export interface Source {
  index: number;
  title: string;
  url: string;
  publisher: string | null;
  published_date: string | null;
  geography: string | null;
  unit: string | null;
  period: string | null;
  claim_type: 'historical' | 'forecast' | 'other';
  used_for: string;
}

export interface Claim {
  section_id: string;
  text: string;
  kind: 'evidence' | 'assumption' | 'customer_input' | 'calculation';
  confidence: 'high' | 'medium' | 'low';
  source_indexes: number[];
  evidence_date: string | null;
}

export interface ScorecardItem {
  id: CriterionId;
  /** 0–100 or null (not enough evidence; never zero). */
  score: number | null;
  basis: ScoreBasis;
  note: string;
  improvement: string;
}

export interface Improvement {
  action: string;
  purpose: string;
  measure: string;
}

export interface Chart {
  kind: 'evidence' | 'scenario' | 'none';
  title: string;
  unit: string;
  series: { label: string; value: number; source_index: number | null }[];
  note: string;
}

export interface StandardReport {
  title: string;
  idea_summary: string;
  verdict: { label: VerdictLabel; explanation: string };
  scorecard: ScorecardItem[];
  chart: Chart;
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  financial_inputs: unknown;
  risks: { risk: string; validation_method: string }[];
  improvements: Improvement[];
  experiment: { description: string; budget_amount: number; duration: string; success_criterion: string };
  sources: Source[];
  limitations: string[];
  claims: Claim[];
}

export interface DetailedReport {
  title: string;
  executive_summary: string[];
  sections: { id: string; heading: string; paragraphs: string[]; bullets: string[]; table: { columns: string[]; rows: string[][] } | null }[];
  sensitivity: { change: string; effect: string }[];
  sources: Source[];
  limitations: string[];
  claims: Claim[];
}
