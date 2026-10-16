/*
  Compact GENERATION schemas sent to Anthropic as output_config.format, and
  the explicit mapping from them to the application model in
  report-schema.ts.

  Why a separate schema: the API compiles the format into a grammar. The full
  application model (nested objects, nullable unions, 13 $defs, eight levels
  deep) made that grammar too large and the request failed with HTTP 400
  "The compiled grammar is too large". These shapes are deliberately flat:
  no unions, no enums, no nullable fields, few object shapes, shallow nesting.
  Business constraints (lengths, counts, allowed labels, source ids) are
  validated here on the server after generation, never by the grammar.

  Unknowns stay explicit: numeric inputs carry a `known` flag, dates use the
  literal "unknown", and scores use 0 for "insufficient evidence"; the mapper
  turns each into null in the application model. Nothing is invented.
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
   Generation schemas (what the model fills in)
--------------------------------------------------------------------------- */

const MoneyInput = z.object({
  /** false = not known; value is then ignored. */
  known: z.boolean(),
  value: z.number(),
  unit: z.string(),
  /** customer_input | assumption | evidence (validated server-side). */
  basis: z.string(),
  note: z.string(),
});

const Volumes = z.object({ low: z.number(), base: z.number(), high: z.number(), basis: z.string(), note: z.string() });

/** A research source the report relies on, by its id in the research list. */
const SourceUse = z.object({
  id: z.number(),
  used_for: z.string(),
  /** Publication or data date as printed, or "unknown". */
  date: z.string(),
  geography: z.string(),
  period: z.string(),
  /** historical | forecast | other */
  type: z.string(),
});

const Claim = z.object({
  section: z.string(),
  text: z.string(),
  /** evidence | assumption | customer_input | calculation */
  kind: z.string(),
  /** high | medium | low */
  confidence: z.string(),
  source_ids: z.array(z.number()),
  date: z.string(),
});

export const StandardGenSchema = z.object({
  title: z.string(),
  idea_summary: z.string(),
  /** Exactly one of the three verdict labels. */
  verdict: z.string(),
  verdict_explanation: z.string(),
  /** Five scores in order: demand, competition, differentiation, financial_clarity, founder_fit. 1–5, or 0 = insufficient evidence. */
  scores: z.array(z.number()),
  score_notes: z.array(z.string()),
  /** evidence | scenario | none */
  chart_kind: z.string(),
  chart_title: z.string(),
  chart_unit: z.string(),
  chart_note: z.string(),
  chart_labels: z.array(z.string()),
  chart_values: z.array(z.number()),
  /** Parallel to chart_values; research source id per point, 0 = none. */
  chart_source_ids: z.array(z.number()),
  swot_strengths: z.array(z.string()),
  swot_weaknesses: z.array(z.string()),
  swot_opportunities: z.array(z.string()),
  swot_threats: z.array(z.string()),
  price: MoneyInput,
  variable_cost: MoneyInput,
  fixed_monthly: MoneyInput,
  volumes: Volumes,
  risks: z.array(z.string()),
  risk_validations: z.array(z.string()),
  improvements: z.array(z.string()),
  experiment_description: z.string(),
  experiment_budget: z.number(),
  experiment_duration: z.string(),
  experiment_success: z.string(),
  sources_used: z.array(SourceUse),
  limitations: z.array(z.string()),
  claims: z.array(Claim),
});
export type StandardGen = z.infer<typeof StandardGenSchema>;

const GenSection = z.object({
  /** One of the nine fixed section ids. */
  id: z.string(),
  heading: z.string(),
  paragraphs: z.array(z.string()),
  bullets: z.array(z.string()),
  /** Empty = no table. */
  table_columns: z.array(z.string()),
  table_rows: z.array(z.array(z.string())),
});

export const DetailedGenSchema = z.object({
  title: z.string(),
  executive_summary: z.array(z.string()),
  sections: z.array(GenSection),
  price: MoneyInput,
  variable_cost: MoneyInput,
  fixed_monthly: MoneyInput,
  volumes: Volumes,
  sensitivity_changes: z.array(z.string()),
  sensitivity_effects: z.array(z.string()),
  sources_used: z.array(SourceUse),
  limitations: z.array(z.string()),
  claims: z.array(Claim),
});
export type DetailedGen = z.infer<typeof DetailedGenSchema>;

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

function clip(s: string, max: number, field: string, d: MappingDiagnostics): string {
  const t = s.trim();
  if (t.length <= max) return t;
  d.truncated.push(field);
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function clipList(items: string[], max: number, maxLen: number, field: string, d: MappingDiagnostics): string[] {
  return items.filter((s) => s.trim()).slice(0, max).map((s, i) => clip(s, maxLen, `${field}[${i}]`, d));
}

function basisOf(s: string, d: MappingDiagnostics, field: string): Basis {
  const v = s.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'customer_input' || v === 'assumption' || v === 'evidence') return v;
  d.normalised.push(`${field}:${s}`);
  return 'assumption';
}

function unknownToNull(s: string, max: number): string | null {
  const t = s.trim();
  if (!t || /^(unknown|n\/a|none|null)$/i.test(t)) return null;
  return t.slice(0, max);
}

function money(m: StandardGen['price'], field: string, d: MappingDiagnostics, withUnit: true): { value: number | null; unit: string; basis: Basis; note: string };
function money(m: StandardGen['price'], field: string, d: MappingDiagnostics, withUnit: false): { value: number | null; basis: Basis; note: string };
function money(m: StandardGen['price'], field: string, d: MappingDiagnostics, withUnit: boolean) {
  const value = m.known && Number.isFinite(m.value) ? m.value : null;
  const base = { value, basis: basisOf(m.basis, d, `${field}.basis`), note: clip(m.note, 120, `${field}.note`, d) };
  return withUnit ? { ...base, unit: clip(m.unit || 'sale', 30, `${field}.unit`, d) } : base;
}

/** Research sources are numbered 1..n in the prompt; only those ids may be cited. */
function sourceTable(research: ResearchSource[]) {
  return (id: number) => (Number.isInteger(id) && id >= 1 && id <= research.length ? research[id - 1] : null);
}

function mapSources(uses: StandardGen['sources_used'], research: ResearchSource[], max: number, d: MappingDiagnostics): { sources: StandardReport['sources']; renumber: Map<number, number> } {
  const lookup = sourceTable(research);
  const renumber = new Map<number, number>();
  const sources: StandardReport['sources'] = [];
  for (const u of uses) {
    const src = lookup(u.id);
    if (!src || renumber.has(u.id)) {
      if (!src) d.droppedSourceIds.push(u.id);
      continue;
    }
    if (sources.length >= max) break;
    const index = sources.length + 1;
    renumber.set(u.id, index);
    const type = /forecast/i.test(u.type) ? 'forecast' : /historical/i.test(u.type) ? 'historical' : 'other';
    sources.push({
      index,
      title: clip(src.title || src.url, 110, `sources[${index}].title`, d),
      url: src.url.slice(0, 300),
      publisher: src.publisher ? src.publisher.slice(0, 60) : null,
      published_date: unknownToNull(u.date, 30) ?? (src.published_date ? src.published_date.slice(0, 30) : null),
      geography: unknownToNull(u.geography, 40) ?? (src.geography ? src.geography.slice(0, 40) : null),
      unit: src.unit ? src.unit.slice(0, 40) : null,
      period: unknownToNull(u.period, 40) ?? (src.period ? src.period.slice(0, 40) : null),
      claim_type: type,
      used_for: clip(u.used_for, 120, `sources[${index}].used_for`, d),
    });
  }
  return { sources, renumber };
}

function mapClaims(claims: StandardGen['claims'], renumber: Map<number, number>, max: number, d: MappingDiagnostics): StandardReport['claims'] {
  const out: StandardReport['claims'] = [];
  for (const c of claims.slice(0, max)) {
    const ids = [...new Set(c.source_ids.map((id) => renumber.get(id)).filter((n): n is number => typeof n === 'number'))].slice(0, 4);
    const dropped = c.source_ids.length - ids.length;
    if (dropped > 0) d.droppedSourceIds.push(...c.source_ids.filter((id) => !renumber.has(id)));
    let kind = c.kind.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!['evidence', 'assumption', 'customer_input', 'calculation'].includes(kind)) {
      d.normalised.push(`claim.kind:${c.kind}`);
      kind = 'assumption';
    }
    if (kind === 'evidence' && ids.length === 0) {
      kind = 'assumption';
      d.downgradedClaims += 1;
    }
    let confidence = c.confidence.trim().toLowerCase();
    if (!['high', 'medium', 'low'].includes(confidence)) confidence = 'low';
    if (!c.text.trim()) continue;
    out.push({
      section_id: clip(c.section || 'summary', 40, 'claim.section', d),
      text: clip(c.text, 320, 'claim.text', d),
      kind: kind as StandardReport['claims'][number]['kind'],
      confidence: confidence as 'high' | 'medium' | 'low',
      source_indexes: ids,
      evidence_date: unknownToNull(c.date, 40),
    });
  }
  return out;
}

function verdictLabel(s: string, d: MappingDiagnostics): (typeof VERDICTS)[number] {
  const t = s.trim().toLowerCase();
  const hit = VERDICTS.find((v) => v.toLowerCase() === t) ?? VERDICTS.find((v) => t.startsWith(v.toLowerCase().split(' ')[0]) && t.includes(v.toLowerCase().split(' ').at(-1)!));
  if (hit) return hit;
  d.normalised.push(`verdict:${s}`);
  return 'Refine before investing';
}

export function mapStandardGeneration(gen: StandardGen, research: ResearchSource[], unknowns: string[]): { report: StandardReport; diagnostics: MappingDiagnostics } {
  const d: MappingDiagnostics = { truncated: [], droppedSourceIds: [], downgradedClaims: 0, normalised: [] };
  const { sources, renumber } = mapSources(gen.sources_used, research, 8, d);

  const scorecard = SCORECARD_IDS.map((id, i) => {
    const raw = gen.scores[i];
    const score = Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : null;
    if (raw !== undefined && score === null && raw !== 0) d.normalised.push(`score[${i}]:${raw}`);
    const note = clip(gen.score_notes[i] ?? '', 130, `score_notes[${i}]`, d);
    return { id, score, note: note || (score === null ? 'Insufficient evidence to rate.' : 'No note provided.') };
  });

  const kindRaw = gen.chart_kind.trim().toLowerCase();
  let chartKind: 'evidence' | 'scenario' | 'none' = kindRaw === 'evidence' ? 'evidence' : kindRaw === 'scenario' ? 'scenario' : 'none';
  const series = gen.chart_labels.slice(0, 6).map((label, i) => {
    const sid = gen.chart_source_ids[i] ?? 0;
    const idx = renumber.get(sid) ?? null;
    if (sid && idx === null) d.droppedSourceIds.push(sid);
    return { label: clip(label, 24, `chart_labels[${i}]`, d), value: Number.isFinite(gen.chart_values[i]) ? gen.chart_values[i] : 0, source_index: idx };
  }).filter((_, i) => Number.isFinite(gen.chart_values[i]));
  // An "evidence" chart whose points cite no valid source is not evidence.
  if (chartKind === 'evidence' && !series.some((s) => s.source_index !== null)) {
    chartKind = series.length ? 'scenario' : 'none';
    d.normalised.push('chart_kind:evidence-without-sources');
  }
  if (series.length === 0) chartKind = 'none';

  const risksRaw = gen.risks.map((r, i) => ({ risk: r, validation_method: gen.risk_validations[i] ?? '' })).filter((r) => r.risk.trim());
  const risks = risksRaw.slice(0, 3).map((r, i) => ({ risk: clip(r.risk, 110, `risks[${i}]`, d), validation_method: clip(r.validation_method || 'Validate directly with potential customers.', 130, `risk_validations[${i}]`, d) }));

  const limitations = clipList(gen.limitations, 4, 130, 'limitations', d);
  for (const u of unknowns) if (limitations.length < 4 && !limitations.some((l) => l.toLowerCase().includes(u.toLowerCase().slice(0, 12)))) limitations.push(clip(`Not provided by the customer: ${u}.`, 130, 'limitations.unknown', d));
  if (limitations.length === 0) limitations.push(sources.length ? 'Local figures were limited; some statements rest on assumptions.' : 'No retrievable sources were found; statements rest on assumptions and customer inputs.');

  const report: StandardReport = {
    title: clip(gen.title, 80, 'title', d) || 'Idea validation report',
    idea_summary: clip(gen.idea_summary, 160, 'idea_summary', d) || 'Summary not provided.',
    verdict: { label: verdictLabel(gen.verdict, d), explanation: clip(gen.verdict_explanation, 600, 'verdict_explanation', d) || 'No explanation was generated.' },
    scorecard,
    chart: { kind: chartKind, title: clip(gen.chart_title, 80, 'chart_title', d), unit: clip(gen.chart_unit, 30, 'chart_unit', d), series: chartKind === 'none' ? [] : series, note: clip(gen.chart_note, 200, 'chart_note', d) },
    swot: {
      strengths: clipList(gen.swot_strengths, 3, 90, 'swot_strengths', d),
      weaknesses: clipList(gen.swot_weaknesses, 3, 90, 'swot_weaknesses', d),
      opportunities: clipList(gen.swot_opportunities, 3, 90, 'swot_opportunities', d),
      threats: clipList(gen.swot_threats, 3, 90, 'swot_threats', d),
    },
    financial_inputs: {
      price: money(gen.price, 'price', d, true),
      variable_cost: money(gen.variable_cost, 'variable_cost', d, true),
      fixed_monthly: money(gen.fixed_monthly, 'fixed_monthly', d, false),
      volumes: { low: Math.max(0, gen.volumes.low || 0), base: Math.max(0, gen.volumes.base || 0), high: Math.max(0, gen.volumes.high || 0), basis: basisOf(gen.volumes.basis, d, 'volumes.basis'), note: clip(gen.volumes.note, 160, 'volumes.note', d) },
    },
    risks: risks.length ? risks : [{ risk: 'No risks were generated.', validation_method: 'Talk to ten potential customers before spending.' }],
    improvements: clipList(gen.improvements, 5, 150, 'improvements', d),
    experiment: {
      description: clip(gen.experiment_description, 220, 'experiment_description', d) || 'No experiment was generated.',
      budget_amount: Math.max(0, Number.isFinite(gen.experiment_budget) ? gen.experiment_budget : 0),
      duration: clip(gen.experiment_duration, 40, 'experiment_duration', d),
      success_criterion: clip(gen.experiment_success, 160, 'experiment_success', d) || 'Not specified.',
    },
    sources,
    limitations,
    claims: mapClaims(gen.claims, renumber, 30, d),
  };
  if (report.improvements.length < 3) {
    while (report.improvements.length < 3) report.improvements.push('Validate the next most uncertain assumption with real customers before spending.');
    d.normalised.push('improvements:padded');
  }
  return { report: StandardReportSchema.parse(report), diagnostics: d };
}

export function mapDetailedGeneration(gen: DetailedGen, research: ResearchSource[]): { report: DetailedReport; diagnostics: MappingDiagnostics } {
  const d: MappingDiagnostics = { truncated: [], droppedSourceIds: [], downgradedClaims: 0, normalised: [] };
  const { sources, renumber } = mapSources(gen.sources_used, research, 12, d);
  const byId = new Map(gen.sections.map((s) => [s.id.trim().toLowerCase(), s]));
  const sections = DETAILED_SECTION_IDS.map((id) => {
    const s = byId.get(id);
    if (!s) d.normalised.push(`section:${id}:missing`);
    const columns = (s?.table_columns ?? []).slice(0, 6).map((c, i) => clip(c, 40, `${id}.table_columns[${i}]`, d));
    const rows = (s?.table_rows ?? []).slice(0, 14).map((r) => r.slice(0, columns.length).map((c) => clip(c, 120, `${id}.table_rows`, d)));
    return {
      id,
      heading: clip(s?.heading || id.replace(/_/g, ' '), 90, `${id}.heading`, d),
      paragraphs: (s?.paragraphs ?? (s ? [] : ['This section could not be generated.'])).slice(0, 8).map((p, i) => clip(p, 1500, `${id}.paragraphs[${i}]`, d)),
      bullets: (s?.bullets ?? []).slice(0, 12).map((b, i) => clip(b, 300, `${id}.bullets[${i}]`, d)),
      table: columns.length >= 2 && rows.length ? { columns, rows } : null,
    };
  });
  const report: DetailedReport = {
    title: clip(gen.title, 80, 'title', d) || 'Detailed report',
    executive_summary: clipList(gen.executive_summary, 7, 260, 'executive_summary', d),
    sections,
    financial_inputs: {
      price: money(gen.price, 'price', d, true),
      variable_cost: money(gen.variable_cost, 'variable_cost', d, true),
      fixed_monthly: money(gen.fixed_monthly, 'fixed_monthly', d, false),
      volumes: { low: Math.max(0, gen.volumes.low || 0), base: Math.max(0, gen.volumes.base || 0), high: Math.max(0, gen.volumes.high || 0), basis: basisOf(gen.volumes.basis, d, 'volumes.basis'), note: clip(gen.volumes.note, 160, 'volumes.note', d) },
    },
    sensitivity: gen.sensitivity_changes.slice(0, 8).map((c, i) => ({ change: clip(c, 80, `sensitivity_changes[${i}]`, d), effect: clip(gen.sensitivity_effects[i] ?? '', 160, `sensitivity_effects[${i}]`, d) })),
    sources,
    limitations: clipList(gen.limitations, 8, 200, 'limitations', d),
    claims: mapClaims(gen.claims, renumber, 80, d),
  };
  while (report.executive_summary.length < 3) {
    report.executive_summary.push('See the sections below.');
    d.normalised.push('executive_summary:padded');
  }
  if (report.limitations.length === 0) report.limitations.push('No limitations were declared by the researcher.');
  return { report: DetailedReportSchema.parse(report), diagnostics: d };
}
