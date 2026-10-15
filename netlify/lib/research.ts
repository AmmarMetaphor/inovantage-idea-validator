/*
  Report generation interfaces and implementations.

  AnthropicGenerator: two calls. "research" uses the server-side web search
  tool to gather public evidence for the stated market and returns the
  sources plus the model's research notes. "compose" turns the brief, the
  sources and the notes into the structured report (structured outputs).

  StubGenerator: deterministic placeholder for local/staging runs. Refused in
  production by env.ts. Its output is explicitly labelled as not research.
*/
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CURRENCIES, MARKETS } from '../../src/config/product';
import { asArray, asBool, asEstimate, asString, isExistingBusiness } from '../../src/questionnaire/helpers';
import { optionLabel, STEPS, visibleFields } from '../../src/questionnaire/schema';
import type { Answers } from '../../src/questionnaire/types';
import type { ResearchSource } from './db/types';
import { DISCLAIMER, ReportContentSchema, type ReportContent } from './report-schema';

export interface Brief {
  orderRef: string;
  market: 'UK' | 'US' | 'AU';
  currency: string;
  ideaName: string;
  /** Human-readable "Question: answer" lines built from the schema. */
  lines: string[];
  existingBusiness: boolean;
}

export interface ResearchOutput {
  sources: ResearchSource[];
  notes: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ComposeOutput {
  report: ReportContent;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ReportGenerator {
  readonly name: string;
  research(brief: Brief): Promise<ResearchOutput>;
  compose(brief: Brief, sources: ResearchSource[], notes: string): Promise<ComposeOutput>;
}

/** Thrown for failures that a retry will not fix (refusal, invalid output). */
export class NonRetryableGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableGenerationError';
  }
}

/* ---------------------------------------------------------------------------
   Brief construction: readable, labelled, nothing but the customer's answers
--------------------------------------------------------------------------- */

export function buildBrief(input: { orderRef: string; market: 'UK' | 'US' | 'AU'; currency: string; ideaName: string; answers: Answers }): Brief {
  const sym = CURRENCIES.find((c) => c.code === input.currency)?.symbol ?? '';
  const lines: string[] = [];
  for (const step of STEPS) {
    for (const field of visibleFields(step, input.answers)) {
      if (field.type === 'checkbox' || field.id === 'email') continue;
      const v = input.answers[field.id];
      let text: string;
      switch (field.type) {
        case 'select':
        case 'radio':
          text = asString(v) ? optionLabel(field, asString(v)) : '';
          break;
        case 'checkbox-group':
          text = asArray(v).map((x) => optionLabel(field, x)).join('; ');
          break;
        case 'estimate': {
          const e = asEstimate(v);
          text = e.unknown ? 'UNKNOWN (customer does not know; research a typical figure and label it as an assumption)' : `${field.unit === 'currency' ? sym : ''}${e.value}${field.suffix ? ' ' + field.suffix : ''}`;
          break;
        }
        default:
          text = asString(v);
      }
      if (text.trim()) lines.push(`${field.label}: ${text.trim()}`);
    }
  }
  if (asBool(input.answers.ackScope)) lines.push('Customer acknowledged the report is general guidance, not advice.');
  return { orderRef: input.orderRef, market: input.market, currency: input.currency, ideaName: input.ideaName, lines, existingBusiness: isExistingBusiness(input.answers) };
}

function marketName(code: string) {
  return MARKETS.find((m) => m.code === code)?.label ?? code;
}

/* ---------------------------------------------------------------------------
   Anthropic implementation
--------------------------------------------------------------------------- */

const SYSTEM_RESEARCH = `You are a research analyst preparing evidence for a business-idea feasibility report. Work only from public, citable sources for the customer's primary market. Prefer official statistics, regulators, trade bodies, established market research summaries, and reputable local sources.

For every useful finding record, on one line: the finding, the number if any, the source URL, and the publication or data date. Write "DATE UNKNOWN" when the page gives no date. Never state a statistic you did not read in a source; if you searched and could not find a figure, write "NOT FOUND: <what you looked for>" so the report can declare the gap. Do not give advice yet.

Cover: demand and customer base in the stated area; competitors and their typical pricing; typical start-up and running costs for this kind of business; regulations, licences or insurance; seasonality and risks. Finish with two lists: "FINDINGS" (one per line with URL and date) and "GAPS" (what could not be found). Keep notes concise and factual.`;

const SYSTEM_COMPOSE = `You write evidence-based feasibility reports for one business idea in one primary market, for the person who will decide whether to pursue it. Tone: calm, direct, plain British English, no hype, no guarantees.

Evidence discipline:
- A claim of kind "evidence" must rest on a listed research source: put the URL(s) in source_urls and the publication or data date in evidence_date (null only if the source gives none). Mention the date in the sentence where it matters ("in 2024, …").
- Anything not read in a source is an "assumption", a "customer_input" or a "calculation", never "evidence". Never invent a statistic, percentage or market size. If the research notes say NOT FOUND for something, say plainly in the relevant section that no reliable figure was found, and list it in research_gaps.
- Where the customer marked a figure as unknown, use a clearly labelled assumed or researched figure and say which.
- Show your arithmetic for break-even and income-objective calculations as "calculation" claims.
- Every section's main statements should appear in the claims list with the right kind and confidence.

Structure: use these section ids in order: summary, idea, market, competition, numbers, fit, risks, next_steps, sources. The "sources" section lists each source used with its URL and date. Address the customer's biggest concern directly inside the risks section. research_gaps must list every topic that could not be evidenced; it may be empty only if nothing was missing. Never promise outcomes. Never include the customer's email address.`;

const USER_LOCATION: Record<string, { country: string; timezone: string }> = {
  UK: { country: 'GB', timezone: 'Europe/London' },
  US: { country: 'US', timezone: 'America/New_York' },
  AU: { country: 'AU', timezone: 'Australia/Sydney' },
};

export class AnthropicGenerator implements ReportGenerator {
  readonly name = 'anthropic';
  private client: Anthropic;
  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000, maxRetries: 2 });
  }

  async research(brief: Brief): Promise<ResearchOutput> {
    const loc = USER_LOCATION[brief.market];
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_RESEARCH, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'high' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 12,
          user_location: { type: 'approximate', country: loc.country, timezone: loc.timezone },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Primary market: ${marketName(brief.market)}. Currency for figures: ${brief.currency}.\n\nCustomer brief (verbatim answers):\n${brief.lines.map((l) => `- ${l}`).join('\n')}\n\nGather the evidence described in your instructions and finish with organised research notes.`,
        },
      ],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new NonRetryableGenerationError(`Research refused (${message.stop_details?.category ?? 'unspecified'}).`);
    }
    const sources: ResearchSource[] = [];
    let notes = '';
    for (const block of message.content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === 'web_search_result') {
            sources.push({ url: r.url, title: r.title ?? null, publisher: safeHost(r.url), page_age: r.page_age ?? null, snippet: null });
          }
        }
      } else if (block.type === 'text') {
        notes += block.text + '\n';
      }
    }
    return { sources: dedupe(sources).slice(0, 60), notes: notes.trim(), usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } };
  }

  async compose(brief: Brief, sources: ResearchSource[], notes: string): Promise<ComposeOutput> {
    const sourceList = sources.map((s, i) => `[${i + 1}] ${s.title ?? s.url} — ${s.url} — date: ${s.page_age ?? 'unknown'}`).join('\n');
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 24000,
      system: [{ type: 'text', text: SYSTEM_COMPOSE, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'high', format: zodOutputFormat(ReportContentSchema) },
      messages: [
        {
          role: 'user',
          content: `Order reference: ${brief.orderRef}\nPrimary market: ${marketName(brief.market)}\nCurrency: ${brief.currency}\nIdea name: ${brief.ideaName}\nExisting business: ${brief.existingBusiness ? 'yes' : 'no'}\n\nCustomer brief:\n${brief.lines.map((l) => `- ${l}`).join('\n')}\n\nResearch sources:\n${sourceList || '(none found)'}\n\nResearch notes:\n${notes || '(none)'}\n\nWrite the full feasibility report in the required structure. In "limitations", state what evidence was thin or missing.`,
        },
      ],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new NonRetryableGenerationError(`Composition refused (${message.stop_details?.category ?? 'unspecified'}).`);
    }
    if (message.stop_reason === 'max_tokens') throw new Error('Report composition hit max_tokens; retrying.');
    const parsed = message.parsed_output;
    if (!parsed) throw new Error('Report composition returned no parseable output; retrying.');
    const report = ReportContentSchema.parse(parsed);
    return { report: { ...report, limitations: report.limitations || DISCLAIMER }, model: message.model, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } };
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function dedupe(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

/* ---------------------------------------------------------------------------
   Stub implementation (never in production)
--------------------------------------------------------------------------- */

export class StubGenerator implements ReportGenerator {
  readonly name = 'stub';
  researchCalls = 0;
  composeCalls = 0;
  failResearchOnce = false;
  failComposeOnce = false;

  async research(_brief: Brief): Promise<ResearchOutput> {
    this.researchCalls += 1;
    if (this.failResearchOnce) {
      this.failResearchOnce = false;
      throw new Error('stub research failure');
    }
    return {
      sources: [{ url: 'https://example.invalid/stub-source', title: 'STUB SOURCE — not real research', publisher: 'example.invalid', page_age: null, snippet: null }],
      notes: 'STUB NOTES: no research was performed.',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  async compose(brief: Brief, sources: ResearchSource[], _notes: string): Promise<ComposeOutput> {
    this.composeCalls += 1;
    if (this.failComposeOnce) {
      this.failComposeOnce = false;
      throw new Error('stub compose failure');
    }
    const sec = (id: string, heading: string, text: string) => ({ id, heading, paragraphs: [text], bullets: [], table: null });
    const stubNote = 'STUB GENERATOR OUTPUT. This text was produced without any research and must never be sent to a paying customer.';
    const report: ReportContent = {
      title: `Feasibility report (STUB): ${brief.ideaName}`,
      verdict: { label: 'Uncertain, more evidence needed', rationale: stubNote },
      summary_bullets: [stubNote, `Market: ${brief.market}`, `Inputs received: ${brief.lines.length}`],
      sections: [
        sec('summary', 'Summary', stubNote),
        sec('idea', 'The idea as submitted', brief.lines.join('\n')),
        sec('market', 'Market and demand', stubNote),
        sec('competition', 'Competition', stubNote),
        sec('numbers', 'The numbers', stubNote),
        sec('fit', 'Fit with your circumstances', stubNote),
        sec('risks', 'Risks', stubNote),
        sec('next_steps', 'Next steps', stubNote),
        sec('sources', 'Sources', sources.map((s) => s.url).join('\n') || 'none'),
      ],
      claims: [{ section_id: 'summary', text: stubNote, kind: 'assumption', confidence: 'low', source_urls: [], evidence_date: null }],
      next_steps: ['Configure REPORT_GENERATOR=anthropic', 'Set ANTHROPIC_API_KEY', 'Re-run the job'],
      assumptions: ['Everything: this is stub output.'],
      research_gaps: ['All of it: no research was performed.'],
      limitations: stubNote,
    };
    return { report, model: 'stub', usage: { input_tokens: 0, output_tokens: 0 } };
  }
}
