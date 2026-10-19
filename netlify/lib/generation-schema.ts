/*
  GENERATION schemas: the shapes sent to Anthropic as output_config.format,
  and the explicit mapping from them to the application model in
  report-schema.ts.

  Why they look like this. The API compiles the format into a grammar and
  rejects large ones with HTTP 400 "The compiled grammar is too large". Two
  attempts failed live:
    - the full application model (15 object shapes, 8 nullable unions,
      13 $defs, depth 8)                                     → req_011Cg69DBbcWEcjBbUimXPtJ
    - one flat object with ~62 properties across 5 shapes    → req_011Cg6CEUVVA1hXsnDuoXcHH
  The published limits (24 optional, 16 union parameters) were not the
  binding constraint; the internal limit tracks total property count. So the
  report is now generated as several small, independent PARTS, each a single
  flat object with at most 16 properties, no nested objects, no unions, no
  enums, no optionals, and arrays no deeper than number[][]. Parts run in
  parallel and are merged here.

  Business rules (lengths, counts, labels, source ids) are enforced in the
  mapping, never by the grammar. Unknowns stay explicit: a numeric input has a
  `known` flag, a score of 0 means "insufficient evidence", and the mapper
  turns each into null. Source URLs, titles, publishers and dates always come
  from the research rows; the model only cites ids.
*/
import { z } from 'zod';
import type { ResearchSource } from './db/types';
import {
  DETAILED_SECTION_IDS,
  DetailedReportSchema,
  SCORECARD_IDS,
  StandardReportSchema,
  VERDICTS,
  type DetailedReport,
  type StandardReport,
} from './report-schema';

/* ---------------------------------------------------------------------------
   Shared fragments
--------------------------------------------------------------------------- */

/** Claims about the part's own content, as parallel arrays (4 properties). */
const CLAIM_FIELDS = {
  claim_texts: z.array(z.string()),
  /** evidence | assumption | customer_input | calculation */
  claim_kinds: z.array(z.string()),
  /** high | medium | low */
  claim_confidences: z.array(z.string()),
  /** Research source ids per claim; [] when none. */
  claim_source_ids: z.array(z.array(z.number())),
};

/** Financial inputs as parallel arrays over FINANCE_KEYS (5 properties). */
export const FINANCE_KEYS = ['price', 'variable_cost', 'fixed_monthly', 'volume_low', 'volume_base', 'volume_high'] as const;
const FINANCE_FIELDS = {
  /** One flag per FINANCE_KEYS entry: false = nobody knows (value ignored). */
  finance_known: z.array(z.boolean()),
  finance_values: z.array(z.number()),
  /** customer_input | assumption | evidence, per entry. */
  finance_basis: z.array(z.string()),
  finance_notes: z.array(z.string()),
  price_unit: z.string(),
};

/* ---------------------------------------------------------------------------
   Standard report: three parts
--------------------------------------------------------------------------- */

export const StandardVerdictPart = z.object({
  title: z.string(),
  idea_summary: z.string(),
  verdict: z.string(),
  verdict_explanation: z.string(),
  /** Nine integers 0–100 in SCORECARD_IDS order (ignored where score_basis is "insufficient"). */
  scores: z.array(z.number()),
  /** evidence | assumption | insufficient, per criterion. */
  score_basis: z.array(z.string()),
  score_notes: z.array(z.string()),
  /** One way to strengthen each criterion, same order. */
  score_improvements: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  threats: z.array(z.string()),
  ...CLAIM_FIELDS,
});

export const StandardFinancePart = z.object({
  ...FINANCE_FIELDS,
  /** evidence | scenario | none */
  chart_kind: z.string(),
  chart_title: z.string(),
  chart_unit: z.string(),
  chart_note: z.string(),
  chart_labels: z.array(z.string()),
  chart_values: z.array(z.number()),
  /** Research source id per point, 0 = none. */
  chart_source_ids: z.array(z.number()),
  ...CLAIM_FIELDS,
});

export const StandardActionPart = z.object({
  risks: z.array(z.string()),
  risk_validations: z.array(z.string()),
  /** Prioritised recommendations as parallel arrays: action, why it matters, how to measure. */
  improvements: z.array(z.string()),
  improvement_purposes: z.array(z.string()),
  improvement_measures: z.array(z.string()),
  experiment_description: z.string(),
  experiment_budget: z.number(),
  experiment_duration: z.string(),
  experiment_success: z.string(),
  /** Research source ids the report relies on, with what each was used for. */
  source_ids_used: z.array(z.number()),
  source_uses: z.array(z.string()),
  limitations: z.array(z.string()),
  ...CLAIM_FIELDS,
});

export const STANDARD_PARTS = {
  verdict: StandardVerdictPart,
  finance: StandardFinancePart,
  action: StandardActionPart,
} as const;
export type StandardParts = { [K in keyof typeof STANDARD_PARTS]: z.infer<(typeof STANDARD_PARTS)[K]> };

/* ---------------------------------------------------------------------------
   Detailed report: three section parts + one summary part
--------------------------------------------------------------------------- */

function sectionFields(n: 1 | 2) {
  return {
    [`s${n}_heading`]: z.string(),
    [`s${n}_paragraphs`]: z.array(z.string()),
    [`s${n}_bullets`]: z.array(z.string()),
    /** Empty = no table. */
    [`s${n}_table_columns`]: z.array(z.string()),
    [`s${n}_table_rows`]: z.array(z.array(z.string())),
  } as Record<`s${typeof n}_heading`, z.ZodString> & Record<`s${typeof n}_paragraphs` | `s${typeof n}_bullets` | `s${typeof n}_table_columns`, z.ZodArray<z.ZodString>> & Record<`s${typeof n}_table_rows`, z.ZodArray<z.ZodArray<z.ZodString>>>;
}

/** Two consecutive sections of the nine (the last part uses s1 only). */
export const DetailedSectionsPart = z.object({ ...sectionFields(1), ...sectionFields(2), ...CLAIM_FIELDS });

export const DetailedSummaryPart = z.object({
  title: z.string(),
  executive_summary: z.array(z.string()),
  ...FINANCE_FIELDS,
  sensitivity_changes: z.array(z.string()),
  sensitivity_effects: z.array(z.string()),
  source_ids_used: z.array(z.number()),
  source_uses: z.array(z.string()),
  limitations: z.array(z.string()),
  ...CLAIM_FIELDS,
});

/** Which sections each detailed part writes, in order: 2+2+2+2+1. */
export const DETAILED_SECTION_GROUPS: (typeof DETAILED_SECTION_IDS)[number][][] = [
  DETAILED_SECTION_IDS.slice(0, 2),
  DETAILED_SECTION_IDS.slice(2, 4),
  DETAILED_SECTION_IDS.slice(4, 6),
  DETAILED_SECTION_IDS.slice(6, 8),
  DETAILED_SECTION_IDS.slice(8, 9),
];

export type DetailedParts = { sections: z.infer<typeof DetailedSectionsPart>[]; summary: z.infer<typeof DetailedSummaryPart> };

/** Every schema that is sent to the API, for diagnostics and tests. */
export const GENERATION_SCHEMAS = {
  'standard.verdict': StandardVerdictPart,
  'standard.finance': StandardFinancePart,
  'standard.action': StandardActionPart,
  'detailed.sections': DetailedSectionsPart,
  'detailed.summary': DetailedSummaryPart,
} as const;

/* ---------------------------------------------------------------------------
   Mapping to the application model (server-side validation lives here)
--------------------------------------------------------------------------- */

export interface MappingDiagnostics {
  truncated: string[];
  droppedSourceIds: number[];
  downgradedClaims: number;
  normalised: string[];
}

type Basis = 'customer_input' | 'assumption' | 'evidence';
type ClaimFields = z.infer<z.ZodObject<typeof CLAIM_FIELDS>>;
type FinanceFields = z.infer<z.ZodObject<typeof FINANCE_FIELDS>>;

function newDiagnostics(): MappingDiagnostics {
  return { truncated: [], droppedSourceIds: [], downgradedClaims: 0, normalised: [] };
}

function clip(s: string | undefined, max: number, field: string, d: MappingDiagnostics): string {
  const t = (s ?? '').trim();
  if (t.length <= max) return t;
  d.truncated.push(field);
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function clipList(items: string[] | undefined, max: number, maxLen: number, field: string, d: MappingDiagnostics): string[] {
  return (items ?? []).filter((s) => s && s.trim()).slice(0, max).map((s, i) => clip(s, maxLen, `${field}[${i}]`, d));
}

function basisOf(s: string | undefined, d: MappingDiagnostics, field: string): Basis {
  const v = (s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'customer_input' || v === 'assumption' || v === 'evidence') return v;
  d.normalised.push(`${field}:${s ?? ''}`);
  return 'assumption';
}

function unknownToNull(s: string | null | undefined, max: number): string | null {
  const t = (s ?? '').trim();
  if (!t || /^(unknown|n\/a|none|null)$/i.test(t)) return null;
  return t.slice(0, max);
}

/**
 * Sources are numbered 1..n in the prompt (research order). The report keeps
 * only cited ids that exist, renumbered 1..k in citation order. All
 * provenance comes from the research row, never from the model.
 */
class SourceTable {
  readonly renumber = new Map<number, number>();
  readonly sources: StandardReport['sources'] = [];
  constructor(private research: ResearchSource[], private max: number, private d: MappingDiagnostics) {}

  cite(id: number, usedFor = ''): number | null {
    if (!Number.isInteger(id) || id < 1 || id > this.research.length) {
      if (id !== 0) this.d.droppedSourceIds.push(id);
      return null;
    }
    const existing = this.renumber.get(id);
    if (existing) {
      if (usedFor && !this.sources[existing - 1].used_for) this.sources[existing - 1].used_for = clip(usedFor, 120, `sources[${existing}].used_for`, this.d);
      return existing;
    }
    if (this.sources.length >= this.max) return null;
    const src = this.research[id - 1];
    const index = this.sources.length + 1;
    this.renumber.set(id, index);
    this.sources.push({
      index,
      title: clip(src.title || src.url, 110, `sources[${index}].title`, this.d),
      url: src.url.slice(0, 300),
      publisher: src.publisher ? src.publisher.slice(0, 60) : null,
      published_date: unknownToNull(src.published_date ?? src.page_age, 30),
      geography: unknownToNull(src.geography, 40),
      unit: unknownToNull(src.unit, 40),
      period: unknownToNull(src.period, 40),
      claim_type: src.claim_type === 'historical' || src.claim_type === 'forecast' ? src.claim_type : 'other',
      used_for: clip(usedFor, 120, `sources[${index}].used_for`, this.d),
    });
    return index;
  }

  /** Ensure a `used_for` on sources cited only from claims or chart points. */
  finish(): StandardReport['sources'] {
    for (const s of this.sources) if (!s.used_for) s.used_for = 'Cited in the report';
    return this.sources;
  }
}

function mapClaims(part: ClaimFields, section: string, table: SourceTable, d: MappingDiagnostics): StandardReport['claims'] {
  const out: StandardReport['claims'] = [];
  part.claim_texts.forEach((text, i) => {
    if (!text || !text.trim()) return;
    const rawIds = part.claim_source_ids[i] ?? [];
    const ids = [...new Set(rawIds.map((id) => table.cite(id)).filter((n): n is number => n !== null))].slice(0, 4);
    let kind = (part.claim_kinds[i] ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!['evidence', 'assumption', 'customer_input', 'calculation'].includes(kind)) {
      d.normalised.push(`claim.kind:${part.claim_kinds[i] ?? ''}`);
      kind = 'assumption';
    }
    if (kind === 'evidence' && ids.length === 0) {
      kind = 'assumption';
      d.downgradedClaims += 1;
    }
    let confidence = (part.claim_confidences[i] ?? '').trim().toLowerCase();
    if (!['high', 'medium', 'low'].includes(confidence)) confidence = 'low';
    const first = ids[0] ? table.sources[ids[0] - 1] : null;
    out.push({
      section_id: section,
      text: clip(text, 320, 'claim.text', d),
      kind: kind as StandardReport['claims'][number]['kind'],
      confidence: confidence as 'high' | 'medium' | 'low',
      source_indexes: ids,
      evidence_date: first?.published_date ?? null,
    });
  });
  return out;
}

function mapFinance(part: FinanceFields, d: MappingDiagnostics): StandardReport['financial_inputs'] {
  const at = (i: number) => {
    const known = part.finance_known[i] === true;
    const raw = part.finance_values[i];
    const value = known && typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    return { value, basis: basisOf(part.finance_basis[i], d, `finance_basis[${i}]`), note: clip(part.finance_notes[i], 120, `finance_notes[${i}]`, d) };
  };
  const unit = clip(part.price_unit || 'sale', 30, 'price_unit', d);
  const price = at(0);
  const variable = at(1);
  const fixed = at(2);
  const vol = (i: number) => Math.max(0, at(i).value ?? 0);
  const volBasis = basisOf(part.finance_basis[4] ?? part.finance_basis[3], d, 'finance_basis[volume]');
  const volNote = clip([part.finance_notes[3], part.finance_notes[4], part.finance_notes[5]].filter((n) => n && n.trim()).join(' ') || 'Monthly volume scenarios.', 160, 'finance_notes[volume]', d);
  return {
    price: { ...price, unit },
    variable_cost: { ...variable, unit },
    fixed_monthly: fixed,
    volumes: { low: vol(3), base: vol(4), high: vol(5), basis: volBasis, note: volNote },
  };
}

function verdictLabel(s: string, d: MappingDiagnostics): (typeof VERDICTS)[number] {
  const t = s.trim().toLowerCase();
  const hit = VERDICTS.find((v) => v.toLowerCase() === t) ?? VERDICTS.find((v) => t.startsWith(v.toLowerCase().split(' ')[0]) && t.includes(v.toLowerCase().split(' ').at(-1)!));
  if (hit) return hit;
  d.normalised.push(`verdict:${s}`);
  return 'Refine before investing';
}

export function mapStandardParts(parts: StandardParts, research: ResearchSource[], unknowns: string[]): { report: StandardReport; diagnostics: MappingDiagnostics } {
  const d = newDiagnostics();
  const table = new SourceTable(research, 8, d);
  const { verdict: v, finance: f, action: a } = parts;

  // Sources the model says it relied on come first, in its order.
  a.source_ids_used.forEach((id, i) => table.cite(id, a.source_uses[i] ?? ''));

  const scorecard = SCORECARD_IDS.map((id, i) => {
    const basisRaw = (v.score_basis[i] ?? '').trim().toLowerCase();
    const raw = v.scores[i];
    let basis: 'evidence' | 'assumption' | 'insufficient' = basisRaw === 'evidence' ? 'evidence' : basisRaw === 'assumption' ? 'assumption' : 'insufficient';
    if (basisRaw && basis === 'insufficient' && !/insufficient|not enough|unknown|none/.test(basisRaw)) d.normalised.push(`score_basis[${i}]:${v.score_basis[i]}`);
    if (!basisRaw && typeof raw === 'number' && Number.isFinite(raw)) basis = 'assumption';
    // A score is only kept when a basis supports it; anything else is "not enough evidence", never zero.
    const score = basis !== 'insufficient' && typeof raw === 'number' && Number.isFinite(raw) ? Math.round(Math.min(100, Math.max(0, raw))) : null;
    if (score === null && basis !== 'insufficient') {
      basis = 'insufficient';
      d.normalised.push(`score[${i}]:${String(raw)}`);
    }
    const note = clip(v.score_notes[i], 150, `score_notes[${i}]`, d);
    return { id, score, basis, note: note || (score === null ? 'Not enough evidence to rate this criterion.' : 'No reason was given.'), improvement: clip(v.score_improvements[i], 150, `score_improvements[${i}]`, d) };
  });

  const kindRaw = f.chart_kind.trim().toLowerCase();
  let chartKind: 'evidence' | 'scenario' | 'none' = kindRaw === 'evidence' ? 'evidence' : kindRaw === 'scenario' ? 'scenario' : 'none';
  const series = f.chart_labels
    .slice(0, 6)
    .map((label, i) => ({ label: clip(label, 24, `chart_labels[${i}]`, d), value: f.chart_values[i], source_index: table.cite(f.chart_source_ids[i] ?? 0) }))
    .filter((p): p is { label: string; value: number; source_index: number | null } => typeof p.value === 'number' && Number.isFinite(p.value));
  if (chartKind === 'evidence' && !series.some((s) => s.source_index !== null)) {
    chartKind = series.length ? 'scenario' : 'none';
    d.normalised.push('chart_kind:evidence-without-sources');
  }
  if (series.length === 0) chartKind = 'none';

  const risks = a.risks
    .map((r, i) => ({ risk: r, validation_method: a.risk_validations[i] ?? '' }))
    .filter((r) => r.risk && r.risk.trim())
    .slice(0, 3)
    .map((r, i) => ({ risk: clip(r.risk, 110, `risks[${i}]`, d), validation_method: clip(r.validation_method || 'Validate directly with potential customers.', 130, `risk_validations[${i}]`, d) }));

  const limitations = clipList(a.limitations, 4, 130, 'limitations', d);
  for (const u of unknowns) if (limitations.length < 4 && !limitations.some((l) => l.toLowerCase().includes(u.toLowerCase().slice(0, 12)))) limitations.push(clip(`Not provided by the customer: ${u}.`, 130, 'limitations.unknown', d));
  if (limitations.length === 0) limitations.push(research.length ? 'Local figures were limited; some statements rest on assumptions.' : 'No retrievable sources were found; statements rest on assumptions and customer inputs.');

  const claims = [...mapClaims(v, 'verdict', table, d), ...mapClaims(f, 'financials', table, d), ...mapClaims(a, 'risks_actions', table, d)].slice(0, 30);

  const improvements = a.improvements
    .map((action, i) => ({ action, purpose: a.improvement_purposes[i] ?? '', measure: a.improvement_measures[i] ?? '' }))
    .filter((r) => r.action && r.action.trim())
    .slice(0, 5)
    .map((r, i) => ({ action: clip(r.action, 150, `improvements[${i}]`, d), purpose: clip(r.purpose, 140, `improvement_purposes[${i}]`, d), measure: clip(r.measure, 140, `improvement_measures[${i}]`, d) }));
  while (improvements.length < 3) {
    improvements.push({ action: 'Validate the next most uncertain assumption with real customers before spending.', purpose: 'Reduces the risk of building on a guess.', measure: 'Suggested: ten conversations that confirm or change the assumption.' });
    d.normalised.push('improvements:padded');
  }

  const report: StandardReport = {
    title: clip(v.title, 80, 'title', d) || 'Idea validation report',
    idea_summary: clip(v.idea_summary, 160, 'idea_summary', d) || 'Summary not provided.',
    verdict: { label: verdictLabel(v.verdict, d), explanation: clip(v.verdict_explanation, 600, 'verdict_explanation', d) || 'No explanation was generated.' },
    scorecard,
    chart: { kind: chartKind, title: clip(f.chart_title, 80, 'chart_title', d), unit: clip(f.chart_unit, 30, 'chart_unit', d), series: chartKind === 'none' ? [] : series, note: clip(f.chart_note, 200, 'chart_note', d) },
    swot: {
      strengths: clipList(v.strengths, 3, 90, 'strengths', d),
      weaknesses: clipList(v.weaknesses, 3, 90, 'weaknesses', d),
      opportunities: clipList(v.opportunities, 3, 90, 'opportunities', d),
      threats: clipList(v.threats, 3, 90, 'threats', d),
    },
    financial_inputs: mapFinance(f, d),
    risks: risks.length ? risks : [{ risk: 'No risks were generated.', validation_method: 'Talk to ten potential customers before spending.' }],
    improvements,
    experiment: {
      description: clip(a.experiment_description, 220, 'experiment_description', d) || 'No experiment was generated.',
      budget_amount: Math.max(0, Number.isFinite(a.experiment_budget) ? a.experiment_budget : 0),
      duration: clip(a.experiment_duration, 40, 'experiment_duration', d),
      success_criterion: clip(a.experiment_success, 160, 'experiment_success', d) || 'Not specified.',
    },
    sources: table.finish(),
    limitations,
    claims,
  };
  return { report: StandardReportSchema.parse(report), diagnostics: d };
}

export function mapDetailedParts(parts: DetailedParts, research: ResearchSource[]): { report: DetailedReport; diagnostics: MappingDiagnostics } {
  const d = newDiagnostics();
  const table = new SourceTable(research, 12, d);
  const s = parts.summary;
  s.source_ids_used.forEach((id, i) => table.cite(id, s.source_uses[i] ?? ''));

  const sections: DetailedReport['sections'] = [];
  DETAILED_SECTION_GROUPS.forEach((group, g) => {
    const part = parts.sections[g] as Record<string, unknown> | undefined;
    group.forEach((id, j) => {
      const n = j + 1;
      const get = <T,>(key: string, fallback: T): T => (part && part[`s${n}_${key}`] !== undefined ? (part[`s${n}_${key}`] as T) : fallback);
      if (!part) d.normalised.push(`section:${id}:missing`);
      const columns = get<string[]>('table_columns', []).slice(0, 6).map((c, i) => clip(c, 40, `${id}.table_columns[${i}]`, d));
      const rows = get<string[][]>('table_rows', []).slice(0, 14).map((r) => r.slice(0, columns.length).map((c) => clip(c, 120, `${id}.table_rows`, d)));
      sections.push({
        id,
        heading: clip(get<string>('heading', ''), 90, `${id}.heading`, d) || id.replace(/_/g, ' '),
        paragraphs: (part ? get<string[]>('paragraphs', []) : ['This section could not be generated.']).slice(0, 8).map((p, i) => clip(p, 1500, `${id}.paragraphs[${i}]`, d)),
        bullets: get<string[]>('bullets', []).slice(0, 12).map((b, i) => clip(b, 300, `${id}.bullets[${i}]`, d)),
        table: columns.length >= 2 && rows.length ? { columns, rows } : null,
      });
    });
  });

  const claims = [
    ...parts.sections.flatMap((part, g) => mapClaims(part, DETAILED_SECTION_GROUPS[g]?.[0] ?? 'sections', table, d)),
    ...mapClaims(s, 'summary', table, d),
  ].slice(0, 80);

  const executive_summary = clipList(s.executive_summary, 7, 260, 'executive_summary', d);
  while (executive_summary.length < 3) {
    executive_summary.push('See the sections below.');
    d.normalised.push('executive_summary:padded');
  }
  const limitations = clipList(s.limitations, 8, 200, 'limitations', d);
  if (limitations.length === 0) limitations.push('No limitations were declared by the researcher.');

  const report: DetailedReport = {
    title: clip(s.title, 80, 'title', d) || 'Detailed report',
    executive_summary,
    sections,
    financial_inputs: mapFinance(s, d),
    sensitivity: s.sensitivity_changes.slice(0, 8).map((c, i) => ({ change: clip(c, 80, `sensitivity_changes[${i}]`, d), effect: clip(s.sensitivity_effects[i], 160, `sensitivity_effects[${i}]`, d) })),
    sources: table.finish(),
    limitations,
    claims,
  };
  return { report: DetailedReportSchema.parse(report), diagnostics: d };
}
