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
import { STEPS, optionLabel, visibleFields } from '../../src/questionnaire/schema';
import { STEPS_V1 } from '../../src/questionnaire/schema-v1';
import type { Answers, Step } from '../../src/questionnaire/types';
import type { ResearchSource } from './db/types';
import { DetailedGenSchema, StandardGenSchema, mapDetailedGeneration, mapStandardGeneration, type MappingDiagnostics } from './generation-schema';
import { DETAILED_SECTION_IDS, SCORECARD_IDS, VERDICTS, type DetailedReport, type StandardReport } from './report-schema';

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
   Brief construction (works for answers_version 1 and 2)
--------------------------------------------------------------------------- */

export function buildBrief(input: { orderRef: string; market: 'UK' | 'US' | 'AU'; currency: string; ideaName: string; answers: Answers; answersVersion?: number }): Brief {
  const version = input.answersVersion ?? (input.answers.ideaDescription !== undefined ? 2 : 1);
  const steps: Step[] = version >= 2 ? STEPS : STEPS_V1;
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
  const stage = asString(input.answers.stage);
  return {
    orderRef: input.orderRef,
    market: input.market,
    currency: input.currency,
    ideaName: input.ideaName,
    lines,
    unknowns,
    existingBusiness: ['trading-new', 'trading-established'].includes(stage),
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

const SYSTEM_STANDARD = `You write concise, evidence-based feasibility verdicts for one business idea in one primary market. The output fills a two-page report, so every field has a hard length limit; write tightly, in plain British English, no hype, no guarantees, no probability of success.

Output shape (every field is required; use an empty string or empty array when there is nothing to say, never invent content to fill a field):
- title ≤ 10 words; idea_summary ≤ 25 words.
- verdict: exactly one of ${VERDICTS.map((v) => `"${v}"`).join(', ')}. verdict_explanation ≤ 85 words, grounded in the sources and the customer's answers.
- scores: exactly five integers in this order: ${SCORECARD_IDS.join(', ')}. Use 1–5, or 0 when the evidence is insufficient to rate. score_notes: five notes in the same order, ≤ 18 words each.
- Chart: chart_kind is "evidence" only when a listed source supplies the series; then chart_source_ids holds that source's id for each point (same length as chart_values). Otherwise "scenario" (label the basis in chart_note) or "none" (state the data gap in chart_note, leave labels/values empty). At most 6 points; chart_labels ≤ 3 words each; chart_title ≤ 10 words; chart_unit is the unit of the values.
- swot_*: up to 3 items each, ≤ 14 words each.
- price, variable_cost (both per sale) and fixed_monthly: known=true with the value in the stated currency, or known=false when nobody knows (then still give basis and note). basis is "customer_input", "evidence" or "assumption"; if the customer said NOT SURE, use known=true with a labelled assumption and explain it in note (≤ 20 words). unit is "sale", "hour", "month" or similar. volumes: low/base/high monthly sales with basis and note. Do NOT compute the scenario table; the system computes it.
- risks: exactly 3, ≤ 18 words each; risk_validations: the cheap way to test each risk, same order, ≤ 20 words each.
- improvements: exactly 5 specific, prioritised changes, ≤ 22 words each.
- experiment_*: one cheap test with a budget (number, stated currency), a duration and a measurable success criterion.
- sources_used: one entry per research source you relied on, by its id [n] from the supplied list. Never invent a source or cite an id that is not in the list; type is "historical", "forecast" or "other"; date is the publication or data date as printed, or "unknown".
- limitations: up to 4 items, ≤ 20 words each: what could not be found or verified, including every input the customer marked NOT SURE.
- claims: every factual statement you relied on (≤ 30). kind is "evidence" (then source_ids lists the research ids read), "assumption", "customer_input" or "calculation"; confidence high/medium/low; date "unknown" if not applicable.

Evidence discipline: use only the supplied research sources. Never invent a competitor, growth rate, market size or citation. National or global figures do not prove local demand; say so when that is all the evidence shows. Never include the customer's email address.`;

const SYSTEM_DETAILED = `You write detailed, evidence-based feasibility reports for one business idea in one primary market, for a founder who has already received a two-page standard verdict and paid for depth. Plain British English, direct, no hype, no guarantees, no probability of success.

Output shape (every field is required; use empty strings/arrays rather than invented content):
- executive_summary: 3–7 bullet sentences.
- sections: exactly nine, with these ids in this order: ${DETAILED_SECTION_IDS.join(', ')}. Each has a heading, paragraphs (≤ 8), bullets (≤ 12) and an optional table: table_columns (2–6 column names) with table_rows (each row the same length as the columns), or both empty for no table. Use tables for competitor comparison, cost assumptions and the roadmap.
- price, variable_cost (per sale) and fixed_monthly: known=true with the value in the stated currency, or known=false when nobody knows; basis "customer_input", "evidence" or "assumption"; note explains the assumption. volumes: low/base/high monthly sales with basis and note. The system computes the scenario table.
- sensitivity_changes (e.g. "price −10%", "volume −25%", "cost +20%") with sensitivity_effects in words, same order.
- sources_used: one entry per research source relied on, by its id [n] from the supplied list; never invent a source or an id; type "historical", "forecast" or "other"; date as printed or "unknown".
- limitations: every gap, ≤ 8 items.
- claims: every factual statement you relied on (≤ 80), kind "evidence" (with source_ids), "assumption", "customer_input" or "calculation"; confidence high/medium/low.

Evidence discipline is identical to the standard report: cite only supplied sources; distinguish historical facts from third-party forecasts; never invent figures. For sizing, describe the methodology and show the arithmetic with its assumptions rather than asserting a market size. Never include the customer's email address.`;

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

/** The exact output formats sent to the API (see scripts/dump-generation-schema.mts). */
export const STANDARD_FORMAT = zodOutputFormat(StandardGenSchema);
export const DETAILED_FORMAT = zodOutputFormat(DetailedGenSchema);

export class AnthropicGenerator implements ReportGenerator {
  readonly name = 'anthropic';
  private client: Anthropic;
  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000, maxRetries: 2 });
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
    const message = await finalMessageOrClassify(this.client.messages.stream({
      model: this.model,
      max_tokens: 20000,
      system: [{ type: 'text', text: SYSTEM_STANDARD, cache_control: { type: 'ephemeral' } }],
      // No tools here: the only grammar is the compact output format.
      output_config: { effort: 'high', format: STANDARD_FORMAT },
      messages: [{ role: 'user', content: `Order reference: ${brief.orderRef}\n${briefBlock(brief)}\n\nResearch sources (cite by id):\n${sourceBlock(sources) || '(none found)'}\n\nResearch notes:\n${notes || '(none)'}\n\nWrite the standard report in the required structure.${tighten}` }],
    }), 'compose_standard');
    if (message.stop_reason === 'max_tokens') throw new Error('Standard composition hit max_tokens; retrying.');
    if (!message.parsed_output) throw new Error('Standard composition returned no parseable output; retrying.');
    const gen = StandardGenSchema.parse(message.parsed_output);
    const { report, diagnostics } = mapStandardGeneration(gen, sources, brief.unknowns);
    return { report, model: message.model, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }, mapping: diagnostics };
  }

  async composeDetailed(brief: Brief, sources: ResearchSource[], notes: string, standard: StandardReport | null): Promise<ComposeOutput<DetailedReport>> {
    const message = await finalMessageOrClassify(this.client.messages.stream({
      model: this.model,
      max_tokens: 32000,
      system: [{ type: 'text', text: SYSTEM_DETAILED, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'high', format: DETAILED_FORMAT },
      messages: [{ role: 'user', content: `Order reference: ${brief.orderRef}\n${briefBlock(brief)}\n\nStandard report verdict already delivered: ${standard ? `${standard.verdict.label}. ${standard.verdict.explanation}` : '(not available)'}\n\nResearch sources (cite by id):\n${sourceBlock(sources) || '(none found)'}\n\nResearch notes:\n${notes || '(none)'}\n\nWrite the detailed report in the required structure.` }],
    }), 'compose_detailed');
    if (message.stop_reason === 'max_tokens') throw new Error('Detailed composition hit max_tokens; retrying.');
    if (!message.parsed_output) throw new Error('Detailed composition returned no parseable output; retrying.');
    const gen = DetailedGenSchema.parse(message.parsed_output);
    const { report, diagnostics } = mapDetailedGeneration(gen, sources);
    return { report, model: message.model, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }, mapping: diagnostics };
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
    scorecard: [
      { id: 'demand', score: null, note: pad('No research performed.', 130) },
      { id: 'competition', score: 2, note: pad('Stub rating.', 130) },
      { id: 'differentiation', score: 3, note: pad('Stub rating.', 130) },
      { id: 'financial_clarity', score: brief.unknowns.length ? 2 : 4, note: pad('Based on inputs only.', 130) },
      { id: 'founder_fit', score: 3, note: pad('Stub rating.', 130) },
    ],
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
    improvements: [1, 2, 3, 4, 5].map((i) => pad(`Stub improvement ${i}`, 150)),
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
