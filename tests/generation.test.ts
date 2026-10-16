/*
  Regression checks for the compose-stage failure
  HTTP 400 "The compiled grammar is too large" (req_011Cg69DBbcWEcjBbUimXPtJ).

  1. The exact output_config.format the SDK sends must stay compact.
  2. The compact generation output maps into the application model with
     server-side validation (invalid source ids dropped, uncited evidence
     downgraded, unknowns kept as null, counts normalised).
  3. An API rejection of the request is non-retryable: the job dies after
     one attempt with a sanitised diagnostic and the research checkpoint intact.
*/
import { BadRequestError, RateLimitError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { ResearchSource } from '../netlify/lib/db/types';
import { DetailedGenSchema, StandardGenSchema, mapDetailedGeneration, mapStandardGeneration, type DetailedGen, type StandardGen } from '../netlify/lib/generation-schema';
import { runJob } from '../netlify/lib/jobs';
import { DetailedReportSchema, StandardReportSchema } from '../netlify/lib/report-schema';
import { classifyApiError, DETAILED_FORMAT, GenerationRequestError, STANDARD_FORMAT } from '../netlify/lib/research';
import { schemaStats } from '../netlify/lib/schema-stats';
import { createPendingOrder, deliverWebhook, makeHarness, type Harness } from './helpers';

/* ------------------------------------------------------------------ 1 --- */

describe('Generation schema compactness (the grammar the API compiles)', () => {
  const limits = { bytes: 4000, anyOf: 0, enums: 0, objects: 8, nesting: 8, maxLength: 0, minLength: 0, minItems: 0, maxItems: 0, minimum: 0, maximum: 0 };

  for (const [name, schema] of [['StandardGenSchema', StandardGenSchema], ['DetailedGenSchema', DetailedGenSchema]] as const) {
    it(`${name} stays flat: no unions, enums or length constraints, few object shapes`, () => {
      const { result, json } = schemaStats(name, schema);
      for (const [k, max] of Object.entries(limits)) expect(result[k as keyof typeof result], k).toBeLessThanOrEqual(max);
      expect(json).toContain('"additionalProperties":false');
      expect(json).not.toMatch(/"type":\["/); // no nullable type arrays
    });
  }

  it('the formats sent to the API are built from the generation schemas, not the application model', () => {
    const std = JSON.stringify((STANDARD_FORMAT as unknown as { schema: unknown }).schema);
    const det = JSON.stringify((DETAILED_FORMAT as unknown as { schema: unknown }).schema);
    expect(std).toContain('"sources_used"');
    expect(std).not.toContain('"scorecard"');
    expect(det).toContain('"table_rows"');
    expect(det).not.toContain('"financial_inputs"');
  });

  it('the application model is much larger than what is sent', () => {
    const app = schemaStats('app', StandardReportSchema).result;
    const gen = schemaStats('gen', StandardGenSchema).result;
    expect(app.anyOf).toBeGreaterThan(0);
    expect(gen.bytes).toBeLessThan(app.bytes * 0.6);
  });
});

/* ------------------------------------------------------------------ 2 --- */

const research: ResearchSource[] = [
  { url: 'https://example.org/a', title: 'Source A', publisher: 'example.org', page_age: null, snippet: null, published_date: '2025-03-01', geography: 'Manchester', unit: 'GBP', period: '2024', claim_type: 'historical' },
  { url: 'https://example.org/b', title: null, publisher: null, page_age: null, snippet: null },
];

function stdGen(over: Partial<StandardGen> = {}): StandardGen {
  const money = { known: true, value: 40, unit: 'sale', basis: 'customer_input', note: 'from answers' };
  return StandardGenSchema.parse({
    title: 'Mobile dog grooming in Manchester', idea_summary: 'Van-based grooming for busy owners.',
    verdict: 'Worth testing', verdict_explanation: 'Demand indicators exist locally.',
    scores: [4, 3, 0, 2, 5], score_notes: ['Strong', 'Crowded', '', 'Costs unknown', 'Experienced'],
    chart_kind: 'evidence', chart_title: 'Dog ownership', chart_unit: 'households', chart_note: 'From source A',
    chart_labels: ['2022', '2023', '2024'], chart_values: [10, 12, 14], chart_source_ids: [1, 1, 9],
    swot_strengths: ['Mobile', 'Experienced', 'Low fixed costs', 'Fourth item dropped'], swot_weaknesses: ['One van'], swot_opportunities: [], swot_threats: ['Incumbents'],
    price: money, variable_cost: { ...money, value: 8, basis: 'assumption' }, fixed_monthly: { known: false, value: 0, unit: '', basis: 'assumption', note: 'Customer not sure' },
    volumes: { low: 20, base: 50, high: 90, basis: 'assumption', note: 'capacity based' },
    risks: ['Van breakdown', 'Seasonal demand', 'Pricing too low', 'Fourth risk dropped'], risk_validations: ['Quote breakdown cover', 'Check winter bookings'],
    improvements: ['Pre-book deposits', 'Bundle services'],
    experiment_description: 'Run 20 paid grooms', experiment_budget: 150, experiment_duration: '4 weeks', experiment_success: '10 repeat bookings',
    sources_used: [{ id: 1, used_for: 'ownership', date: '2025-03-01', geography: 'Manchester', period: '2024', type: 'historical' }, { id: 9, used_for: 'invented', date: 'unknown', geography: '', period: '', type: 'other' }, { id: 1, used_for: 'duplicate', date: '', geography: '', period: '', type: 'other' }],
    limitations: [],
    claims: [
      { section: 'market', text: 'Ownership is rising', kind: 'evidence', confidence: 'high', source_ids: [1], date: '2025' },
      { section: 'market', text: 'Everyone wants this', kind: 'evidence', confidence: 'high', source_ids: [9], date: 'unknown' },
      { section: 'costs', text: 'Fuel is about £300 a month', kind: 'guess', confidence: 'maybe', source_ids: [], date: '' },
    ],
    ...over,
  });
}

describe('Mapping generation output to the application model', () => {
  it('produces a valid StandardReport with unknowns kept explicit', () => {
    const { report, diagnostics } = mapStandardGeneration(stdGen(), research, ['Monthly fixed costs']);
    expect(StandardReportSchema.safeParse(report).success).toBe(true);
    expect(report.scorecard.map((s) => s.score)).toEqual([4, 3, null, 2, 5]);
    expect(report.scorecard[2].note).toMatch(/Insufficient evidence/);
    expect(report.financial_inputs.fixed_monthly.value).toBeNull(); // never an invented zero
    expect(report.financial_inputs.price.value).toBe(40);
    expect(report.limitations.some((l) => l.includes('Monthly fixed costs'))).toBe(true);
    expect(report.improvements).toHaveLength(3);
    expect(diagnostics.normalised).toContain('improvements:padded');
  });

  it('keeps only real research sources, in citation order, and renumbers claims to them', () => {
    const { report, diagnostics } = mapStandardGeneration(stdGen(), research, []);
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0]).toMatchObject({ index: 1, url: 'https://example.org/a', publisher: 'example.org', claim_type: 'historical' });
    expect(diagnostics.droppedSourceIds).toContain(9);
    expect(report.claims[0]).toMatchObject({ kind: 'evidence', source_indexes: [1] });
    // Evidence citing a non-existent source is downgraded, never kept as evidence.
    expect(report.claims[1]).toMatchObject({ kind: 'assumption', source_indexes: [] });
    expect(diagnostics.downgradedClaims).toBe(1);
    // Unknown kind/confidence fall back to the conservative values.
    expect(report.claims[2]).toMatchObject({ kind: 'assumption', confidence: 'low', evidence_date: null });
    // Chart points keep valid citations and drop invalid ones.
    expect(report.chart.kind).toBe('evidence');
    expect(report.chart.series.map((p) => p.source_index)).toEqual([1, 1, null]);
  });

  it('an "evidence" chart without any valid citation becomes a scenario chart', () => {
    const { report } = mapStandardGeneration(stdGen({ chart_source_ids: [9, 0, 0] }), research, []);
    expect(report.chart.kind).toBe('scenario');
  });

  it('clamps counts and lengths to the editorial limits instead of failing', () => {
    const long = 'x'.repeat(500);
    const { report, diagnostics } = mapStandardGeneration(stdGen({ title: long, swot_strengths: [long, long, long, long] }), research, []);
    expect(report.title.length).toBeLessThanOrEqual(80);
    expect(report.swot.strengths).toHaveLength(3);
    expect(report.risks).toHaveLength(3);
    expect(report.risks[2].validation_method).toBeTruthy();
    expect(diagnostics.truncated).toContain('title');
  });

  it('an unrecognised verdict label is normalised and recorded', () => {
    const { report, diagnostics } = mapStandardGeneration(stdGen({ verdict: 'Go for it' }), research, []);
    expect(report.verdict.label).toBe('Refine before investing');
    expect(diagnostics.normalised).toContain('verdict:Go for it');
    expect(mapStandardGeneration(stdGen({ verdict: 'reconsider the current approach' }), research, []).report.verdict.label).toBe('Reconsider the current approach');
  });

  it('maps a detailed generation into the nine fixed sections with tables', () => {
    const money = { known: true, value: 40, unit: 'sale', basis: 'customer_input', note: '' };
    const gen: DetailedGen = DetailedGenSchema.parse({
      title: 'Detailed', executive_summary: ['One'],
      sections: [
        { id: 'competitors', heading: 'Competitors', paragraphs: ['p'], bullets: [], table_columns: ['Name', 'Price', 'Notes'], table_rows: [['A', '£30', 'x', 'extra cell dropped'], ['B', '£35']] },
        { id: 'not_a_section', heading: 'Ignored', paragraphs: [], bullets: [], table_columns: [], table_rows: [] },
      ],
      price: money, variable_cost: money, fixed_monthly: money, volumes: { low: 1, base: 2, high: 3, basis: 'assumption', note: '' },
      sensitivity_changes: ['price −10%'], sensitivity_effects: ['margin falls'],
      sources_used: [{ id: 2, used_for: 'pricing', date: 'unknown', geography: '', period: '', type: 'forecast' }],
      limitations: [], claims: [],
    });
    const { report, diagnostics } = mapDetailedGeneration(gen, research);
    expect(DetailedReportSchema.safeParse(report).success).toBe(true);
    expect(report.sections.map((s) => s.id)).toHaveLength(9);
    const comp = report.sections.find((s) => s.id === 'competitors')!;
    expect(comp.table?.columns).toEqual(['Name', 'Price', 'Notes']);
    expect(comp.table?.rows[0]).toHaveLength(3);
    expect(report.sources[0]).toMatchObject({ url: 'https://example.org/b', title: 'https://example.org/b', claim_type: 'forecast', published_date: null });
    expect(report.executive_summary).toHaveLength(3);
    expect(diagnostics.normalised).toContain('section:market_opportunity:missing');
  });
});

/* ------------------------------------------------------------------ 3 --- */

const GRAMMAR_MESSAGE = 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.';

function apiError(status: 400 | 429, message: string, requestId = 'req_011Cg69DBbcWEcjBbUimXPtJ') {
  const body = { type: 'error', error: { type: status === 429 ? 'rate_limit_error' : 'invalid_request_error', message } };
  const headers = new Headers({ 'request-id': requestId });
  return status === 429 ? new RateLimitError(429, body, message, headers) : new BadRequestError(400, body, message, headers);
}

describe('Classifying Anthropic API errors', () => {
  it('HTTP 400 "compiled grammar is too large" is non-retryable with a sanitised diagnostic', () => {
    const err = classifyApiError(apiError(400, GRAMMAR_MESSAGE), 'compose_standard');
    expect(err).toBeInstanceOf(GenerationRequestError);
    const d = (err as GenerationRequestError).diagnostic;
    expect(d).toMatchObject({ stage: 'compose_standard', status: 400, request_id: 'req_011Cg69DBbcWEcjBbUimXPtJ', error_type: 'invalid_request_error' });
    expect(d.message).toContain('compiled grammar is too large');
    expect(d.message.length).toBeLessThanOrEqual(200);
    expect(err.message).toContain('grammar_too_large');
    expect(JSON.stringify(d)).not.toMatch(/sk-ant|api[_-]?key/i);
  });

  it('rate limits and server errors stay retryable', () => {
    const err = classifyApiError(apiError(429, 'Rate limited'), 'compose_standard');
    expect(err).not.toBeInstanceOf(GenerationRequestError);
    expect(classifyApiError(new Error('ECONNRESET'), 'research')).not.toBeInstanceOf(GenerationRequestError);
  });
});

async function pilotLikeJob(h: Harness) {
  const { sessionId, order } = await createPendingOrder(h);
  h.gateway.pay(sessionId);
  await deliverWebhook(h, sessionId);
  const job = [...h.db.jobs.values()][0];
  return { order, job };
}

function jobDeps(h: Harness) {
  return {
    db: h.db, blobs: h.blobs, mailer: h.mailer, generator: h.generator, log: h.deps.log, now: h.deps.now,
    appUrl: 'https://app.test', tokenTtlDays: 30, heartbeatMs: 60_000, pilotAllowedEmails: ['support@metaphorconsultants.com'],
    renderStandard: async () => ({ pdf: Buffer.from('%PDF-1.4 test'), pageCount: 2 }),
  };
}

describe('Job runner: a rejected compose request is not retried', () => {
  it('dies after one attempt, keeps research, records the diagnostic and fails the report', async () => {
    const h = makeHarness();
    const { order, job } = await pilotLikeJob(h);
    h.generator.rejectComposeRequest = true;
    const out = await runJob(jobDeps(h), job.id, 'w1');
    expect(out.status).toBe('dead');
    const final = (await h.db.getJob(job.id))!;
    expect(final.status).toBe('dead');
    expect(final.attempts).toBe(1);
    expect(final.stage).toBe('compose');
    expect(final.checkpoint.research_done).toBe(true);
    expect(final.checkpoint.research_notes).toBeDefined();
    expect(final.checkpoint.api_error).toMatchObject({ stage: 'compose_standard', status: 400, request_id: 'req_stub' });
    expect(final.last_error).toContain('grammar_too_large');
    expect(h.generator.composeCalls).toBe(1);
    expect(h.generator.researchCalls).toBe(1);
    expect((await h.db.getReport(order.id))!.status).toBe('failed');
    expect((await h.db.getOrder(order.id))!.status).toBe('failed');
    // Research sources are preserved for the resumed run.
    expect(await h.db.getResearchSources(order.id)).not.toHaveLength(0);
    // Confirmation went out once; no report email.
    expect(h.mailer.sent.map((m) => m.subject)).toHaveLength(1);
    // Nothing can claim it again.
    h.clock.advance(60 * 60_000);
    expect(await h.db.claimJob(job.id, 'w2', 60)).toBeNull();
  });

  it('records per-stage timings in the checkpoint on a successful run', async () => {
    const h = makeHarness();
    const { job } = await pilotLikeJob(h);
    const out = await runJob(jobDeps(h), job.id, 'w1');
    expect(out.status).toBe('succeeded');
    const timings = (await h.db.getJob(job.id))!.checkpoint.timings as Record<string, { ms: number; runs: number }>;
    for (const stage of ['confirm', 'research', 'compose', 'render', 'deliver']) {
      expect(timings[stage].runs, stage).toBe(1);
      expect(timings[stage].ms, stage).toBeGreaterThanOrEqual(0);
    }
  });
});
