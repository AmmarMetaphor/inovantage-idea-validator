/*
  Report generation interfaces and implementations.

  AnthropicGenerator:
    research(brief)       → web search (server tool) → sources + notes
    composeStandard(...)  → StandardReport (structured output)
    composeDetailed(...)  → DetailedReport (structured output)

  Financial scenarios are NOT written by the model: it supplies inputs with a
  basis, and netlify/lib/finance.ts computes the table in code.

  StubGenerator: deterministic placeholder for local/staging runs, refused in
  production by env.ts, and labelled as not research in every output.
*/
import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CURRENCIES, MARKETS } from '../../src/config/product';
import { asArray, asBool, asEstimate, asString } from '../../src/questionnaire/helpers';
import { STEPS, isExistingBusinessV3, optionLabel, visibleFields } from '../../src/questionnaire/schema';
import { STEPS_V1 } from '../../src/questionnaire/schema-v1';
import { STEPS_V2 } from '../../src/questionnaire/schema-v2';
import type { Answers, Step } from '../../src/questionnaire/types';
import type { ResearchSource } from './db/types';
import { z } from 'zod';
import { DETAILED_SECTION_GROUPS, FINANCE_KEYS, GENERATION_SCHEMAS, mapDetailedParts, mapStandardParts, type MappingDiagnostics, type StandardParts } from './generation-schema';
import { CRITERIA } from '../../src/config/scoring';
import { VERDICTS, type DetailedReport, type StandardReport } from './report-schema';

export interface Brief {
  orderRef: string;
  market: 'UK' | 'US' | 'AU';
  currency: string;
  ideaName: string;
  /** Human-readable "Question: answer" lines built from the schema. */
  lines: string[];
  /** Inputs the customer marked as unknown; the report must label them as gaps. */
  unknowns: string[];
  existingBusiness: boolean;
  answersVersion: number;
}

export interface ResearchOutput {
  sources: ResearchSource[];
  notes: string;
  retrievedAt: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ComposeOutput<T> {
  report: T;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  /** What server-side validation changed when mapping the generation output. */
  mapping?: MappingDiagnostics;
  /** Parts that had to be generated without a grammar (see composePart). */
  fallbacks?: string[];
}

export interface ReportGenerator {
  readonly name: string;
  research(brief: Brief, scope: 'standard' | 'detailed'): Promise<ResearchOutput>;
  composeStandard(brief: Brief, sources: ResearchSource[], notes: string, opts: { tighten: number }): Promise<ComposeOutput<StandardReport>>;
  composeDetailed(brief: Brief, sources: ResearchSource[], notes: string, standard: StandardReport | null): Promise<ComposeOutput<DetailedReport>>;
}

/** Thrown for failures that a retry will not fix (refusal, invalid output). */
export class NonRetryableGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableGenerationError';
  }
}

/** Sanitised record of a failed API request: never includes prompt text, answers or keys. */
export interface RequestDiagnostic {
  stage: 'research' | 'compose_standard' | 'compose_detailed';
  status: number | null;
  error_type: string | null;
  request_id: string | null;
  /** First 200 characters of the API's own error message. */
  message: string;
  at: string;
}

/**
 * The API rejected the request itself (HTTP 4xx other than rate limits).
 * Re-sending an unchanged request cannot succeed, so the job must not retry.
 * The best-known case is HTTP 400 "The compiled grammar is too large".
 */
export class GenerationRequestError extends NonRetryableGenerationError {
  constructor(message: string, readonly diagnostic: RequestDiagnostic) {
    super(message);
    this.name = 'GenerationRequestError';
  }
}

/** Reasons the API gives for rejecting the request shape, matched case-insensitively. */
const REQUEST_SHAPE_ERRORS = [/compiled grammar is too large/i, /invalid_request_error/i, /schema/i, /output_config/i, /output_format/i];

/**
 * Classify an error from the Anthropic SDK. 400/401/403/404/413/422 cannot
 * be fixed by retrying the same request; 408/409/429/5xx and network errors
 * can, and the job runner's backoff handles those. The diagnostic is
 * sanitised: status, type, request id and a message prefix only.
 */
export function classifyApiError(err: unknown, stage: RequestDiagnostic['stage']): Error {
  if (err instanceof NonRetryableGenerationError) return err;
  if (!(err instanceof APIError)) return err instanceof Error ? err : new Error(String(err));
  const status = typeof err.status === 'number' ? err.status : null;
  const body = err.error && typeof err.error === 'object' && 'error' in err.error ? (err.error as { error?: { message?: string; type?: string } }).error : undefined;
  const rawMessage = body?.message || err.message || 'unknown error';
  const diagnostic: RequestDiagnostic = {
    stage,
    status,
    error_type: err.type ?? body?.type ?? null,
    request_id: err.requestID ?? null,
    message: String(rawMessage).replace(/\s+/g, ' ').slice(0, 200),
    at: new Date().toISOString(),
  };
  const nonRetryable = status !== null && [400, 401, 403, 404, 413, 422].includes(status);
  if (!nonRetryable) return err;
  const shape = REQUEST_SHAPE_ERRORS.some((re) => re.test(diagnostic.message) || (diagnostic.error_type ? re.test(diagnostic.error_type) : false));
  const label = status === 400 && /compiled grammar is too large/i.test(diagnostic.message) ? 'grammar_too_large' : shape ? 'request_rejected' : 'client_error';
  return new GenerationRequestError(`${stage} request rejected by the API (${label}, HTTP ${status}${diagnostic.request_id ? `, ${diagnostic.request_id}` : ''}): ${diagnostic.message}`, diagnostic);
}

/* ---------------------------------------------------------------------------
   Brief construction (works for answers_version 1, 2 and 3)
--------------------------------------------------------------------------- */

export function buildBrief(input: { orderRef: string; market: 'UK' | 'US' | 'AU'; currency: string; ideaName: string; answers: Answers; answersVersion?: number }): Brief {
  const version = input.answersVersion ?? (input.answers.ideaDescription !== undefined ? 3 : 1);
  const steps: Step[] = version >= 3 ? STEPS : version === 2 ? STEPS_V2 : STEPS_V1;
  const sym = CURRENCIES.find((c) => c.code === input.currency)?.symbol ?? '';
  const lines: string[] = [];
  const unknowns: string[] = [];
  for (const step of steps) {
    for (const field of visibleFields(step, input.answers)) {
      if (field.type === 'checkbox' || field.id === 'email') continue;
      const v = input.answers[field.id];
      let text: string;
      switch (field.type) {
        case 'select':
        case 'radio':
        case 'combobox':
          text = asString(v) ? optionLabel(field, asString(v)) : '';
          break;
        case 'checkbox-group':
          text = asArray(v).map((x) => optionLabel(field, x)).join('; ');
          break;
        case 'estimate': {
          const e = asEstimate(v);
          if (e.unknown) {
            unknowns.push(field.label);
            text = 'NOT SURE (customer does not know; use a clearly labelled assumption and list it as a gap)';
          } else {
            text = `${field.unit === 'currency' ? sym : ''}${e.value}${field.suffix ? ' ' + field.suffix : ''}`;
          }
          break;
        }
        default:
          text = asString(v);
      }
      if (text.trim()) lines.push(`${field.label}: ${text.trim()}`);
    }
  }
  if (asBool(input.answers.ackScope)) lines.push('Customer acknowledged the report is general guidance, not advice.');
  return {
    orderRef: input.orderRef,
    market: input.market,
    currency: input.currency,
    ideaName: input.ideaName,
    lines,
    unknowns,
    existingBusiness: isExistingBusinessV3(input.answers),
    answersVersion: version,
  };
}

function marketName(code: string) {
  return MARKETS.find((m) => m.code === code)?.label ?? code;
}

/* ---------------------------------------------------------------------------
   Prompts
--------------------------------------------------------------------------- */

const SYSTEM_RESEARCH = `You are a research analyst gathering evidence for a business-idea feasibility report. Work only from public, retrievable sources for the customer's primary market. Prefer official statistics, regulators, trade bodies, established market research summaries, and reputable local sources.

For every useful finding write ONE line in this exact form:
FINDING | <what it says, with the number and unit> | URL: <url> | PUBLISHER: <name> | DATE: <publication or data date, or UNKNOWN> | GEOGRAPHY: <country/region/city> | PERIOD: <years covered or n/a> | TYPE: historical or forecast

Rules: never state a statistic you did not read on the page; if you searched and could not find something, write "GAP | <what you looked for>". National industry growth is not evidence of local demand; label geography honestly. Do not give advice.

Cover: demand indicators for the stated city/region; competitors and their typical pricing; typical start-up and running costs for this kind of business; regulation, licences or insurance; seasonality and risks. Finish with the FINDING lines first, then the GAP lines.`;

const EVIDENCE_RULES = `Evidence discipline: use only the supplied research sources, cited by their id [n]. Never invent a competitor, growth rate, market size, source or citation. National or global figures do not prove local demand; say so when that is all the evidence shows. Never include the customer's email address.

Claims: every factual statement you rely on in this part goes in the parallel arrays claim_texts, claim_kinds ("evidence" when read in a source, otherwise "assumption", "customer_input" or "calculation"), claim_confidences ("high", "medium" or "low") and claim_source_ids (the research ids read for that claim, [] when none). The four arrays have the same length.

Every field is required. Use an empty string or empty array when there is nothing to say; never pad a field with invented content.`;

const SYSTEM_STANDARD = `You write concise, evidence-based feasibility verdicts for one business idea in one primary market. The output fills a two-page report, so every field has a hard length limit; write tightly, in plain British English, no hype, no guarantees, no probability of success. The report is produced in parts; each request asks for one part only.

${EVIDENCE_RULES}`;

const SYSTEM_DETAILED = `You write detailed, evidence-based feasibility reports for one business idea in one primary market, for a founder who has already received a two-page standard verdict and paid for depth. Plain British English, direct, no hype, no guarantees, no probability of success. The report is produced in parts; each request asks for one part only. For sizing, describe the methodology and show the arithmetic with its assumptions rather than asserting a market size. Distinguish historical facts from third-party forecasts.

${EVIDENCE_RULES}`;

const FINANCE_INSTRUCTION = `Financial inputs as six parallel arrays in this order: ${FINANCE_KEYS.join(', ')} (price and variable_cost per sale, fixed_monthly per month, volumes as monthly sales for a low, base and high case). finance_known[i] is true when a figure can be given (a customer figure, a sourced figure or a labelled assumption) and false when nobody knows; finance_values[i] is the figure in the stated currency (ignored when not known); finance_basis[i] is "customer_input", "evidence" or "assumption"; finance_notes[i] explains it in ≤ 20 words. If the customer said NOT SURE, give a labelled assumption rather than a blank. price_unit is "sale", "hour", "month" or similar. Do NOT compute the scenario table; the system computes it.`;

const PART_INSTRUCTIONS: Record<keyof StandardParts, string> = {
  verdict: `Part 1 of 3: verdict, criterion scores and SWOT.
- title ≤ 10 words; idea_summary ≤ 25 words.
- verdict: exactly one of ${VERDICTS.map((v) => `"${v}"`).join(', ')}. verdict_explanation ≤ 85 words: constructive, specific, grounded in the sources and the customer's answers; say what is supported, what needs strengthening and the most useful next action. Never say an idea is bad or doomed; never guarantee success.
- scores: exactly nine integers from 0 to 100, one per criterion in this order, where higher always means more favourable for the founder:
${CRITERIA.map((c, i) => `  ${i + 1}. ${c.id} (${c.label}): ${c.rubric}`).join('\n')}
  score_basis: nine entries in the same order: "evidence" when the score rests on a cited source, "assumption" when it rests on the customer's answers or reasonable assumptions, "insufficient" when neither supports a rating (the score for that entry is then ignored; never give 0 to mean unknown). Do not inflate scores or impose a floor.
  score_notes: nine brief reasons (≤ 22 words each). score_improvements: nine entries (≤ 22 words each), one practical way to strengthen that criterion, or "" when it is already strong.
- strengths, weaknesses, opportunities, threats: up to 3 items each, ≤ 14 words each. Strengths and opportunities must be supported; do not invent positives.`,
  finance: `Part 2 of 3: financial inputs and the evidence chart.
${FINANCE_INSTRUCTION}
Chart: chart_kind is "evidence" only when a listed source supplies the series; then chart_source_ids holds that source's id for each point (same length as chart_values). Otherwise "scenario" (label the basis in chart_note) or "none" (state the data gap in chart_note and leave labels and values empty). At most 6 points; chart_labels ≤ 3 words each; chart_title ≤ 10 words; chart_unit is the unit of the values; chart_note ≤ 30 words.`,
  action: `Part 3 of 3: risks, recommendations, experiment, sources and limitations.
- risks: exactly 3, ≤ 18 words each; risk_validations: the cheap way to test each risk, same order, ≤ 20 words each. Keep material financial, operational or regulatory concerns visible.
- improvements: exactly 5 prioritised recommendations (the action, ≤ 22 words each); improvement_purposes: why each matters (≤ 20 words, same order); improvement_measures: a practical success measure for each, phrased as a suggestion (≤ 20 words, same order). If the current approach is unworkable, make the first recommendation a viable alternative where one exists.
- experiment_description ≤ 35 words: the one cheap test to run first; experiment_budget as a number in the stated currency; experiment_duration (e.g. "4 weeks"); experiment_success: a measurable criterion ≤ 25 words, labelled as a suggested threshold.
- source_ids_used: the ids of every research source the report relies on (at most 8), with source_uses giving what each was used for (≤ 15 words, same order). Only ids from the supplied list.
- limitations: up to 4 items, ≤ 20 words each: what could not be found or verified, including every input the customer marked NOT SURE.`,
};

const DETAILED_PART_INSTRUCTIONS = {
  sections: (ids: readonly string[], partNo: number, partCount: number) => `Part ${partNo} of ${partCount}: ${ids.length === 1 ? `one section. Write section s1 = "${ids[0]}" and leave every s2_* field empty.` : `two sections. Write section s1 = "${ids[0]}" and s2 = "${ids[1]}".`} For each section: a heading (≤ 12 words), paragraphs (≤ 8, each ≤ 220 words), bullets (≤ 12, each ≤ 40 words) and an optional table: table_columns (2–6 column names) with table_rows (each row has one cell per column), or both empty for no table. Use tables for competitor comparison, cost assumptions and the roadmap.`,
  summary: `Final part: title (≤ 10 words), executive_summary (3–7 bullet sentences, ≤ 40 words each), financial inputs, sensitivity, sources and limitations.
${FINANCE_INSTRUCTION}
sensitivity_changes (e.g. "price −10%", "volume −25%", "cost +20%", up to 8) with sensitivity_effects in words (≤ 25 words each, same order).
source_ids_used: the ids of every research source the report relies on (at most 12), with source_uses giving what each was used for (≤ 15 words, same order). Only ids from the supplied list.
limitations: every gap, up to 8 items, ≤ 30 words each.`,
};

const USER_LOCATION: Record<string, { country: string; timezone: string }> = {
  UK: { country: 'GB', timezone: 'Europe/London' },
  US: { country: 'US', timezone: 'America/New_York' },
  AU: { country: 'AU', timezone: 'Australia/Sydney' },
};

function briefBlock(brief: Brief): string {
  return `Primary market: ${marketName(brief.market)}\nCurrency for figures: ${brief.currency}\nIdea name: ${brief.ideaName}\nExisting business: ${brief.existingBusiness ? 'yes' : 'no'}\n\nCustomer answers (verbatim):\n${brief.lines.map((l) => `- ${l}`).join('\n')}${brief.unknowns.length ? `\n\nInputs the customer marked NOT SURE: ${brief.unknowns.join('; ')}` : ''}`;
}

function sourceBlock(sources: ResearchSource[]): string {
  return sources
    .map((s, i) => `[${i + 1}] ${s.title ?? s.url} | URL: ${s.url} | PUBLISHER: ${s.publisher ?? 'unknown'} | DATE: ${s.published_date ?? s.page_age ?? 'unknown'} | GEOGRAPHY: ${s.geography ?? 'unknown'} | PERIOD: ${s.period ?? 'n/a'} | TYPE: ${s.claim_type ?? 'other'}`)
    .join('\n');
}

/* ---------------------------------------------------------------------------
   Anthropic implementation
--------------------------------------------------------------------------- */

/** The exact output formats sent to the API, one per part (see scripts/dump-generation-schema.mts). */
export const GENERATION_FORMATS = {
  'standard.verdict': zodOutputFormat(GENERATION_SCHEMAS['standard.verdict']),
  'standard.finance': zodOutputFormat(GENERATION_SCHEMAS['standard.finance']),
  'standard.action': zodOutputFormat(GENERATION_SCHEMAS['standard.action']),
  'detailed.sections': zodOutputFormat(GENERATION_SCHEMAS['detailed.sections']),
  'detailed.summary': zodOutputFormat(GENERATION_SCHEMAS['detailed.summary']),
} as const;

/** Text of the API's grammar-size rejection; a part that hits it is regenerated without a grammar. */
const GRAMMAR_TOO_LARGE = /compiled grammar is too large|too complex for compilation/i;

interface PartResult<T> {
  value: T;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  fallback: boolean;
}

export class AnthropicGenerator implements ReportGenerator {
  readonly name = 'anthropic';
  private client: Anthropic;
  constructor(apiKey: string, private model: string, clientOptions: Partial<ConstructorParameters<typeof Anthropic>[0]> = {}) {
    this.client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000, maxRetries: 2, ...clientOptions });
  }

  async research(brief: Brief, scope: 'standard' | 'detailed'): Promise<ResearchOutput> {
    const loc = USER_LOCATION[brief.market];
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_RESEARCH, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'high' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: scope === 'detailed' ? 16 : 10, user_location: { type: 'approximate', country: loc.country, timezone: loc.timezone } }],
      messages: [{ role: 'user', content: `${briefBlock(brief)}\n\nScope: ${scope === 'detailed' ? 'detailed report (go deeper on competitors, pricing, costs, segments and sizing inputs)' : 'two-page standard verdict'}. Gather the evidence described in your instructions.` }],
    });
    const message = await finalMessageOrClassify(stream, 'research');
    const retrievedAt = new Date().toISOString();
    const found = new Map<string, ResearchSource>();
    let notes = '';
    for (const block of message.content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === 'web_search_result' && !found.has(r.url)) {
            found.set(r.url, { url: r.url, title: r.title ?? null, publisher: safeHost(r.url), page_age: r.page_age ?? null, snippet: null, published_date: r.page_age ?? null, geography: null, unit: null, period: null, claim_type: null });
          }
        }
      } else if (block.type === 'text') {
        notes += block.text + '\n';
      }
    }
    // Enrich sources with provenance from FINDING lines where the URL matches.
    for (const line of notes.split('\n')) {
      if (!line.startsWith('FINDING')) continue;
      const url = /URL:\s*(\S+)/.exec(line)?.[1]?.replace(/[|,]+$/, '');
      if (!url) continue;
      const src = found.get(url) ?? { url, title: null, publisher: safeHost(url), page_age: null, snippet: null };
      const publisher = /PUBLISHER:\s*([^|]+)/.exec(line)?.[1]?.trim();
      const date = /DATE:\s*([^|]+)/.exec(line)?.[1]?.trim();
      const geo = /GEOGRAPHY:\s*([^|]+)/.exec(line)?.[1]?.trim();
      const period = /PERIOD:\s*([^|]+)/.exec(line)?.[1]?.trim();
      const type = /TYPE:\s*(historical|forecast)/i.exec(line)?.[1]?.toLowerCase() as 'historical' | 'forecast' | undefined;
      found.set(url, {
        ...src,
        publisher: publisher && publisher !== 'unknown' ? publisher.slice(0, 60) : src.publisher,
        published_date: date && date.toUpperCase() !== 'UNKNOWN' ? date.slice(0, 30) : (src.published_date ?? null),
        geography: geo?.slice(0, 40) ?? null,
        period: period && period !== 'n/a' ? period.slice(0, 40) : null,
        claim_type: type ?? 'other',
        snippet: line.split('|')[1]?.trim().slice(0, 300) ?? null,
      });
    }
    return { sources: [...found.values()].slice(0, 60), notes: notes.trim(), retrievedAt, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } };
  }

  async composeStandard(brief: Brief, sources: ResearchSource[], notes: string, opts: { tighten: number }): Promise<ComposeOutput<StandardReport>> {
    const tighten = opts.tighten > 0 ? `\n\nIMPORTANT: a previous draft overflowed two pages. Use about ${Math.max(40, 70 - opts.tighten * 15)}% of every length limit this time.` : '';
    const shared = `Order reference: ${brief.orderRef}\n${briefBlock(brief)}\n\nResearch sources (cite by id):\n${sourceBlock(sources) || '(none found)'}\n\nResearch notes:\n${notes || '(none)'}`;
    const [verdict, finance, action] = await Promise.all([
      this.composePart('compose_standard', 'standard.verdict', SYSTEM_STANDARD, shared, PART_INSTRUCTIONS.verdict + tighten, 8000),
      this.composePart('compose_standard', 'standard.finance', SYSTEM_STANDARD, shared, PART_INSTRUCTIONS.finance + tighten, 8000),
      this.composePart('compose_standard', 'standard.action', SYSTEM_STANDARD, shared, PART_INSTRUCTIONS.action + tighten, 8000),
    ]);
    const parts = [verdict, finance, action];
    const { report, diagnostics } = mapStandardParts({ verdict: verdict.value, finance: finance.value, action: action.value }, sources, brief.unknowns);
    return { report, model: verdict.model, usage: sumUsage(parts), mapping: diagnostics, fallbacks: fallbackNames(['standard.verdict', 'standard.finance', 'standard.action'], parts) };
  }

  async composeDetailed(brief: Brief, sources: ResearchSource[], notes: string, standard: StandardReport | null): Promise<ComposeOutput<DetailedReport>> {
    const shared = `Order reference: ${brief.orderRef}\n${briefBlock(brief)}\n\nStandard report verdict already delivered: ${standard ? `${standard.verdict.label}. ${standard.verdict.explanation}` : '(not available)'}\n\nResearch sources (cite by id):\n${sourceBlock(sources) || '(none found)'}\n\nResearch notes:\n${notes || '(none)'}`;
    const partCount = DETAILED_SECTION_GROUPS.length + 1;
    const [sectionParts, summary] = await Promise.all([
      Promise.all(DETAILED_SECTION_GROUPS.map((ids, i) => this.composePart('compose_detailed', 'detailed.sections', SYSTEM_DETAILED, shared, DETAILED_PART_INSTRUCTIONS.sections(ids, i + 1, partCount), 10000))),
      this.composePart('compose_detailed', 'detailed.summary', SYSTEM_DETAILED, shared, DETAILED_PART_INSTRUCTIONS.summary, 8000),
    ]);
    const parts: PartResult<unknown>[] = [...sectionParts, summary];
    const { report, diagnostics } = mapDetailedParts({ sections: sectionParts.map((p) => p.value), summary: summary.value }, sources);
    return { report, model: summary.model, usage: sumUsage(parts), mapping: diagnostics, fallbacks: fallbackNames([...DETAILED_SECTION_GROUPS.map((_, i) => `detailed.sections.${i + 1}`), 'detailed.summary'], parts) };
  }

  /**
   * One bounded request: a small flat schema as output_config.format and no
   * tools. If the API still rejects that grammar as too large, the same part
   * is regenerated once without a grammar (plain JSON, the schema quoted in
   * the prompt) and validated with the same Zod schema; any other API
   * rejection stays non-retryable.
   */
  private async composePart<K extends keyof typeof GENERATION_SCHEMAS>(stage: 'compose_standard' | 'compose_detailed', key: K, system: string, shared: string, instruction: string, maxTokens: number): Promise<PartResult<z.infer<(typeof GENERATION_SCHEMAS)[K]>>> {
    const schema = GENERATION_SCHEMAS[key];
    const systemBlocks = [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }];
    const content = (extra = '') => [
      { type: 'text' as const, text: shared, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: `${instruction}${extra}` },
    ];
    try {
      const message = await finalMessageOrClassify(this.client.messages.stream({
        model: this.model,
        max_tokens: maxTokens,
        system: systemBlocks,
        output_config: { effort: 'high', format: GENERATION_FORMATS[key] },
        messages: [{ role: 'user', content: content() }],
      }), stage);
      if (message.stop_reason === 'max_tokens') throw new Error(`${key} hit max_tokens; retrying.`);
      if (!message.parsed_output) throw new Error(`${key} returned no parseable output; retrying.`);
      return { value: schema.parse(message.parsed_output) as z.infer<(typeof GENERATION_SCHEMAS)[K]>, model: message.model, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }, fallback: false };
    } catch (err) {
      if (!(err instanceof GenerationRequestError) || err.diagnostic.status !== 400 || !GRAMMAR_TOO_LARGE.test(err.diagnostic.message)) throw err;
    }
    // Grammar fallback: no output_config.format; the schema is quoted and the
    // output is validated here instead.
    const jsonSchema = JSON.stringify((GENERATION_FORMATS[key] as unknown as { schema: unknown }).schema);
    let lastError = '';
    const usage = { input_tokens: 0, output_tokens: 0 };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const message = await finalMessageOrClassify(this.client.messages.stream({
        model: this.model,
        max_tokens: maxTokens,
        system: systemBlocks,
        output_config: { effort: 'high' },
        messages: [{ role: 'user', content: content(`\n\nRespond with exactly one JSON object and nothing else (no prose, no code fences) that validates against this JSON Schema:\n${jsonSchema}${lastError ? `\n\nYour previous answer was rejected: ${lastError}` : ''}`) }],
      }), stage);
      usage.input_tokens += message.usage.input_tokens;
      usage.output_tokens += message.usage.output_tokens;
      if (message.stop_reason === 'max_tokens') throw new Error(`${key} (fallback) hit max_tokens; retrying.`);
      const text = message.content.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n');
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return { value: parsed.data as z.infer<(typeof GENERATION_SCHEMAS)[K]>, model: message.model, usage, fallback: true };
      lastError = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500);
    }
    throw new Error(`${key} (fallback) did not produce valid JSON: ${lastError}`);
  }
}

/** Awaits a stream's final message; API rejections become GenerationRequestError (non-retryable) with a sanitised diagnostic. */
async function finalMessageOrClassify<M extends { stop_reason: string | null; stop_details?: { category?: string | null } | null }>(stream: { finalMessage(): Promise<M> }, stage: RequestDiagnostic['stage']): Promise<M> {
  let message: M;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    throw classifyApiError(err, stage);
  }
  if (message.stop_reason === 'refusal') throw new NonRetryableGenerationError(`${stage === 'research' ? 'Research' : 'Composition'} refused (${message.stop_details?.category ?? 'unspecified'}).`);
  return message;
}

function sumUsage(parts: PartResult<unknown>[]): { input_tokens: number; output_tokens: number } {
  return parts.reduce((acc, p) => ({ input_tokens: acc.input_tokens + p.usage.input_tokens, output_tokens: acc.output_tokens + p.usage.output_tokens }), { input_tokens: 0, output_tokens: 0 });
}

function fallbackNames(names: string[], parts: PartResult<unknown>[]): string[] {
  return names.filter((_, i) => parts[i]?.fallback);
}

/** The first balanced JSON object in a text response, or the text itself. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** Evidence claims must cite listed sources; downgrade uncited ones to assumptions rather than fail. */
export function checkCitations(claims: { kind: string; source_indexes: number[] }[], sourceCount: number): void {
  for (const c of claims) {
    c.source_indexes = c.source_indexes.filter((i) => i >= 1 && i <= sourceCount);
    if (c.kind === 'evidence' && c.source_indexes.length === 0) c.kind = 'assumption';
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   Stub implementation (never in production)
--------------------------------------------------------------------------- */

const STUB_NOTE = 'STUB GENERATOR OUTPUT. Produced without research; must never reach a paying customer.';

export function stubStandardReport(brief: Brief, long = false): StandardReport {
  const pad = (s: string, n: number) => (long ? (s + ' ').repeat(Math.ceil(n / (s.length + 1))).slice(0, n) : s);
  return {
    title: pad(`Feasibility verdict (STUB): ${brief.ideaName}`, 80),
    idea_summary: pad(STUB_NOTE, 160),
    verdict: { label: 'Refine before investing', explanation: pad(STUB_NOTE, 600) },
    scorecard: CRITERIA.map((c, i) => {
      const insufficient = i === 1 || (brief.unknowns.length > 0 && c.id === 'feasibility');
      return insufficient
        ? { id: c.id, score: null, basis: 'insufficient' as const, note: pad('No research performed: not enough evidence.', 150), improvement: pad('Stub: gather evidence.', 150) }
        : { id: c.id, score: [52, 0, 68, 44, 61, 73, 58, brief.unknowns.length ? 0 : 47, 39][i], basis: i % 3 === 0 ? ('evidence' as const) : ('assumption' as const), note: pad('Stub rating.', 150), improvement: pad(`Stub improvement for ${c.short.toLowerCase()}.`, 150) };
    }),
    chart: { kind: 'none', title: 'Local demand indicators', unit: '', series: [], note: pad('No market data retrieved: stub run.', 200) },
    swot: {
      strengths: [pad('Stub strength', 90)],
      weaknesses: [pad('Stub weakness', 90), pad('Second stub weakness', 90)],
      opportunities: [pad('Stub opportunity', 90)],
      threats: [pad('Stub threat', 90)],
    },
    financial_inputs: {
      price: { value: 45, unit: 'sale', basis: 'customer_input', note: 'from answers' },
      variable_cost: { value: 7, unit: 'sale', basis: 'assumption', note: pad('stub assumption', 120) },
      fixed_monthly: { value: 650, basis: 'assumption', note: pad('stub assumption', 120) },
      volumes: { low: 20, base: 60, high: 110, basis: 'assumption', note: pad('stub volumes', 160) },
    },
    risks: [
      { risk: pad('Stub risk one', 110), validation_method: pad('Talk to ten customers', 130) },
      { risk: pad('Stub risk two', 110), validation_method: pad('Price test with deposits', 130) },
      { risk: pad('Stub risk three', 110), validation_method: pad('Quote real costs', 130) },
    ],
    improvements: [1, 2, 3, 4, 5].map((i) => ({ action: pad(`Stub improvement ${i}`, 150), purpose: pad(`Stub purpose ${i}`, 140), measure: pad(`Suggested measure ${i}`, 140) })),
    experiment: { description: pad('Stub experiment', 220), budget_amount: 150, duration: '4 weeks', success_criterion: pad('Ten paid deposits', 160) },
    sources: [{ index: 1, title: pad('STUB SOURCE — not real research', 110), url: long ? 'https://example.invalid/' + 'a-very-long-path-segment/'.repeat(10) : 'https://example.invalid/stub', publisher: 'example.invalid', published_date: null, geography: brief.market, unit: null, period: null, claim_type: 'other', used_for: pad('nothing', 120) }],
    limitations: [pad('All of it: no research was performed.', 130), ...brief.unknowns.slice(0, 3).map((u) => pad(`Not provided: ${u}`, 130))],
    claims: [{ section_id: 'summary', text: pad(STUB_NOTE, 320), kind: 'assumption', confidence: 'low', source_indexes: [], evidence_date: null }],
  };
}

export class StubGenerator implements ReportGenerator {
  readonly name = 'stub';
  researchCalls = 0;
  composeCalls = 0;
  failResearchOnce = false;
  failComposeOnce = false;
  /** Simulate the API rejecting the compose request (HTTP 400 grammar too large): must not be retried. */
  rejectComposeRequest = false;
  /** Make the standard draft overflow two pages until tighten > 0 (tests the tighten loop). */
  overflowUntilTightened = false;

  async research(_brief: Brief, _scope: 'standard' | 'detailed'): Promise<ResearchOutput> {
    this.researchCalls += 1;
    if (this.failResearchOnce) {
      this.failResearchOnce = false;
      throw new Error('stub research failure');
    }
    return { sources: [{ url: 'https://example.invalid/stub-source', title: 'STUB SOURCE — not real research', publisher: 'example.invalid', page_age: null, snippet: null, claim_type: 'other' }], notes: 'STUB NOTES: no research was performed.', retrievedAt: new Date().toISOString(), usage: { input_tokens: 0, output_tokens: 0 } };
  }

  async composeStandard(brief: Brief, _sources: ResearchSource[], _notes: string, opts: { tighten: number }): Promise<ComposeOutput<StandardReport>> {
    this.composeCalls += 1;
    if (this.failComposeOnce) {
      this.failComposeOnce = false;
      throw new Error('stub compose failure');
    }
    if (this.rejectComposeRequest) {
      throw new GenerationRequestError('compose_standard request rejected by the API (grammar_too_large, HTTP 400, req_stub): The compiled grammar is too large, which would cause performance issues.', {
        stage: 'compose_standard', status: 400, error_type: 'invalid_request_error', request_id: 'req_stub', message: 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.', at: new Date().toISOString(),
      });
    }
    const long = this.overflowUntilTightened && opts.tighten === 0;
    return { report: stubStandardReport(brief, long), model: 'stub', usage: { input_tokens: 0, output_tokens: 0 } };
  }

  async composeDetailed(brief: Brief, sources: ResearchSource[]): Promise<ComposeOutput<DetailedReport>> {
    this.composeCalls += 1;
    const std = stubStandardReport(brief);
    const sec = (id: DetailedReport['sections'][number]['id'], heading: string) => ({ id, heading, paragraphs: [STUB_NOTE], bullets: [], table: null });
    const report: DetailedReport = {
      title: `Detailed report (STUB): ${brief.ideaName}`,
      executive_summary: [STUB_NOTE, `Market: ${brief.market}`, `Inputs: ${brief.lines.length}`],
      sections: [
        sec('market_opportunity', 'Market opportunity and sizing methodology'),
        sec('customer_segments', 'Target customer segments'),
        { ...sec('competitors', 'Competitor comparison and positioning'), table: { columns: ['Competitor', 'Price', 'Note'], rows: [['STUB', 'n/a', 'not research']] } },
        sec('pricing_route_to_market', 'Pricing and route to market'),
        sec('cost_assumptions', 'Start-up and operating-cost assumptions'),
        sec('financial_scenarios', 'Revenue, cash-flow and break-even scenarios'),
        sec('sensitivity_risks', 'Sensitivity analysis and principal risks'),
        sec('roadmap', 'Prioritised launch and validation roadmap'),
        { ...sec('sources_limitations', 'Supporting sources and limitations'), bullets: sources.map((s) => s.url) },
      ],
      financial_inputs: std.financial_inputs,
      sensitivity: [{ change: 'Price −10%', effect: 'stub' }],
      sources: std.sources,
      limitations: ['All of it: stub output.'],
      claims: std.claims,
    };
    return { report, model: 'stub', usage: { input_tokens: 0, output_tokens: 0 } };
  }
}
