/*
  Regression checks for the compose-stage failure
  HTTP 400 "The compiled grammar is too large"
  (req_011Cg69DBbcWEcjBbUimXPtJ, then req_011Cg6CEUVVA1hXsnDuoXcHH).

  1. Every output_config.format sent must stay a small flat object.
  2. The exact request bodies carry no tools and only those formats.
  3. Part outputs map into the application model with server-side
     validation (invalid source ids dropped, uncited evidence downgraded,
     unknowns kept as null, counts normalised, provenance from research rows).
  4. API rejections are non-retryable; the grammar rejection alone triggers a
     validated no-grammar fallback for that part.
  5. The job runner dies after one attempt on a non-retryable rejection with
     a sanitised diagnostic and the research checkpoint intact.
*/
import { BadRequestError, RateLimitError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { ResearchSource } from '../netlify/lib/db/types';
import { DETAILED_SECTION_GROUPS, GENERATION_SCHEMAS, mapDetailedParts, mapStandardParts, type DetailedParts, type StandardParts } from '../netlify/lib/generation-schema';
import { runJob } from '../netlify/lib/jobs';
import { DetailedReportSchema, StandardReportSchema } from '../netlify/lib/report-schema';
import { AnthropicGenerator, buildBrief, classifyApiError, extractJson, GENERATION_FORMATS, GenerationRequestError } from '../netlify/lib/research';
import { schemaStats } from '../netlify/lib/schema-stats';
import { createPendingOrder, deliverWebhook, makeHarness, validAnswers, type Harness } from './helpers';

/* ------------------------------------------------------------------ 1 --- */

describe('Generation schema compactness (the grammar the API compiles)', () => {
  // Community bisections of the undocumented internal limit put reliable
  // schemas at roughly 15–20 properties over 2–3 levels; 62 properties failed live.
  const limits = { bytes: 1500, properties: 16, anyOf: 0, enums: 0, objects: 1, nesting: 5, maxLength: 0, minLength: 0, minItems: 0, maxItems: 0, minimum: 0, maximum: 0 };

  for (const [name, schema] of Object.entries(GENERATION_SCHEMAS)) {
    it(`${name} is one flat object with ≤ ${limits.properties} properties and no unions, enums, $defs or constraints`, () => {
      const { result, json } = schemaStats(name, schema);
      for (const [k, max] of Object.entries(limits)) expect(result[k as keyof typeof result], k).toBeLessThanOrEqual(max);
      expect(json).toContain('"additionalProperties":false');
      expect(json).not.toContain('"$defs"');
      expect(json).not.toContain('"$ref"');
      expect(json).not.toMatch(/"type":\["/);
    });
  }

  it('the whole standard report needs ≤ 48 properties across three parts, none shared', () => {
    const total = ['standard.verdict', 'standard.finance', 'standard.action'].reduce((n, k) => n + schemaStats(k, GENERATION_SCHEMAS[k as keyof typeof GENERATION_SCHEMAS]).result.properties, 0);
    expect(total).toBeLessThanOrEqual(48);
  });

  it('the application model is never what is sent', () => {
    for (const fmt of Object.values(GENERATION_FORMATS)) {
      const json = JSON.stringify((fmt as unknown as { schema: unknown }).schema);
      expect(json).not.toContain('"scorecard"');
      expect(json).not.toContain('"financial_inputs"');
      expect(json).not.toContain('"sources"');
    }
    expect(schemaStats('app', StandardReportSchema).result.anyOf).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ 2 --- */

function captureClient() {
  const bodies: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'captured' } }), { status: 400, headers: { 'content-type': 'application/json', 'request-id': 'req_capture' } });
  };
  return { bodies, gen: new AnthropicGenerator('sk-ant-test-placeholder', 'claude-opus-5-5', { fetch, maxRetries: 0 }) };
}

const brief = buildBrief({ orderRef: 'TEST', market: 'UK', currency: 'GBP', ideaName: 'Test', answers: validAnswers(), answersVersion: 3 });

describe('The exact compose requests', () => {
  it('standard: three parallel requests, no tools, one small format each, shared context cached', async () => {
    const { bodies, gen } = captureClient();
    await expect(gen.composeStandard(brief, [], '', { tighten: 0 })).rejects.toBeInstanceOf(GenerationRequestError);
    expect(bodies).toHaveLength(3);
    for (const b of bodies) {
      expect(b.tools).toBeUndefined();
      const oc = b.output_config as { effort: string; format: { type: string; schema: Record<string, unknown> } };
      expect(oc.format.type).toBe('json_schema');
      expect(Object.keys(oc.format.schema.properties as object).length).toBeLessThanOrEqual(16);
      expect(JSON.stringify(oc.format).length).toBeLessThan(1600);
      const content = (b.messages as { content: { text: string; cache_control?: unknown }[] }[])[0].content;
      expect(content[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(content[0].text).toContain('Order reference: TEST');
    }
    expect(bodies.map((b) => Object.keys(((b.output_config as { format: { schema: { properties: object } } }).format.schema.properties))[0])).toEqual(['title', 'finance_known', 'risks']);
  });

  it('detailed: six requests covering the nine sections', async () => {
    const { bodies, gen } = captureClient();
    await expect(gen.composeDetailed(brief, [], '', null)).rejects.toBeInstanceOf(GenerationRequestError);
    expect(bodies).toHaveLength(6);
    expect(DETAILED_SECTION_GROUPS.flat()).toHaveLength(9);
    for (const b of bodies) expect(b.tools).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ 3 --- */

const research: ResearchSource[] = [
  { url: 'https://example.org/a', title: 'Source A', publisher: 'example.org', page_age: null, snippet: null, published_date: '2025-03-01', geography: 'Manchester', unit: 'GBP', period: '2024', claim_type: 'historical' },
  { url: 'https://example.org/b', title: null, publisher: null, page_age: null, snippet: null, claim_type: 'forecast' },
];

function parts(over: { verdict?: Partial<StandardParts['verdict']>; finance?: Partial<StandardParts['finance']>; action?: Partial<StandardParts['action']> } = {}): StandardParts {
  const claims = { claim_texts: [] as string[], claim_kinds: [] as string[], claim_confidences: [] as string[], claim_source_ids: [] as number[][] };
  return {
    verdict: GENERATION_SCHEMAS['standard.verdict'].parse({
      title: 'Mobile dog grooming in Manchester', idea_summary: 'Van-based grooming for busy owners.',
      verdict: 'Worth testing', verdict_explanation: 'Demand indicators exist locally.',
      scores: [74, 0, 58, 52, 68, 71, 63, 47, 55],
      score_basis: ['evidence', 'insufficient', 'assumption', 'assumption', 'evidence', 'assumption', 'assumption', 'assumption', 'assumption'],
      score_notes: ['Strong', '', 'Van needed', 'Two rivals', 'Real problem', 'Hire a van', 'Clear benefit', 'Tight', 'Fits'],
      score_improvements: ['Pick postcodes', 'Check trends', 'Get quotes', 'Position on calm', 'Quantify', 'Run 20 grooms', 'Test price', 'Set radius', 'Plan training'],
      strengths: ['Mobile', 'Experienced', 'Low fixed costs', 'Fourth item dropped'], weaknesses: ['One van'], opportunities: [], threats: ['Incumbents'],
      ...claims,
      claim_texts: ['Ownership is rising', 'Everyone wants this', 'Fuel is about £300 a month'],
      claim_kinds: ['evidence', 'evidence', 'guess'], claim_confidences: ['high', 'high', 'maybe'], claim_source_ids: [[1], [9], []],
      ...over.verdict,
    }),
    finance: GENERATION_SCHEMAS['standard.finance'].parse({
      finance_known: [true, true, false, true, true, true], finance_values: [40, 8, 0, 20, 50, 90],
      finance_basis: ['customer_input', 'assumption', 'assumption', 'assumption', 'assumption', 'assumption'],
      finance_notes: ['from answers', 'consumables', 'Customer not sure', 'capacity', 'capacity', 'capacity'], price_unit: 'sale',
      chart_kind: 'evidence', chart_title: 'Dog ownership', chart_unit: 'households', chart_note: 'From source A',
      chart_labels: ['2022', '2023', '2024'], chart_values: [10, 12, 14], chart_source_ids: [1, 1, 9],
      ...claims,
      ...over.finance,
    }),
    action: GENERATION_SCHEMAS['standard.action'].parse({
      risks: ['Van breakdown', 'Seasonal demand', 'Pricing too low', 'Fourth risk dropped'], risk_validations: ['Quote breakdown cover', 'Check winter bookings'],
      improvements: ['Pre-book deposits', 'Bundle services'], improvement_purposes: ['Cash before spend'], improvement_measures: ['Ten deposits'],
      limitations: [],
      experiment_description: 'Run 20 paid grooms', experiment_budget: 150, experiment_duration: '4 weeks', experiment_success: '10 repeat bookings',
      source_ids_used: [1, 9, 1], source_uses: ['ownership', 'invented', 'duplicate'],
      ...claims,
      ...over.action,
    }),
  };
}

describe('Mapping part outputs to the application model', () => {
  it('produces a valid StandardReport with unknowns kept explicit', () => {
    const { report, diagnostics } = mapStandardParts(parts(), research, ['Monthly fixed costs']);
    expect(StandardReportSchema.safeParse(report).success).toBe(true);
    expect(report.scorecard.map((s) => s.score)).toEqual([74, null, 58, 52, 68, 71, 63, 47, 55]);
    expect(report.scorecard[1]).toMatchObject({ basis: 'insufficient', score: null });
    expect(report.scorecard[1].note).toMatch(/Not enough evidence/);
    expect(report.scorecard[0]).toMatchObject({ basis: 'evidence', improvement: 'Pick postcodes' });
    expect(report.improvements[0]).toEqual({ action: 'Pre-book deposits', purpose: 'Cash before spend', measure: 'Ten deposits' });
    expect(report.improvements[1]).toMatchObject({ action: 'Bundle services', purpose: '', measure: '' });
    expect(report.financial_inputs.fixed_monthly.value).toBeNull(); // never an invented zero
    expect(report.financial_inputs.price).toMatchObject({ value: 40, unit: 'sale', basis: 'customer_input' });
    expect(report.financial_inputs.volumes).toMatchObject({ low: 20, base: 50, high: 90, basis: 'assumption' });
    expect(report.limitations.some((l) => l.includes('Monthly fixed costs'))).toBe(true);
    expect(report.improvements).toHaveLength(3);
    expect(diagnostics.normalised).toContain('improvements:padded');
  });

  it('keeps only real research sources, with provenance from the research row, and renumbers claims', () => {
    const { report, diagnostics } = mapStandardParts(parts(), research, []);
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0]).toMatchObject({ index: 1, url: 'https://example.org/a', publisher: 'example.org', published_date: '2025-03-01', geography: 'Manchester', claim_type: 'historical', used_for: 'ownership' });
    expect(diagnostics.droppedSourceIds).toContain(9);
    expect(report.claims[0]).toMatchObject({ section_id: 'verdict', kind: 'evidence', source_indexes: [1], evidence_date: '2025-03-01' });
    expect(report.claims[1]).toMatchObject({ kind: 'assumption', source_indexes: [] }); // evidence citing nothing real
    expect(diagnostics.downgradedClaims).toBe(1);
    expect(report.claims[2]).toMatchObject({ kind: 'assumption', confidence: 'low', evidence_date: null });
    expect(report.chart.kind).toBe('evidence');
    expect(report.chart.series.map((p) => p.source_index)).toEqual([1, 1, null]);
  });

  it('a source cited only from a claim is still listed, with a default used_for', () => {
    const { report } = mapStandardParts(parts({ action: { source_ids_used: [], source_uses: [] }, verdict: { claim_source_ids: [[2], [], []] } }), research, []);
    expect(report.sources.map((s) => s.url)).toEqual(['https://example.org/a', 'https://example.org/b']);
    expect(report.sources[1]).toMatchObject({ title: 'https://example.org/b', claim_type: 'forecast', used_for: 'Cited in the report' });
  });

  it('an "evidence" chart without any valid citation becomes a scenario chart', () => {
    const { report } = mapStandardParts(parts({ finance: { chart_source_ids: [9, 0, 0] } }), research, []);
    expect(report.chart.kind).toBe('scenario');
  });

  it('clamps counts and lengths to the editorial limits instead of failing', () => {
    const long = 'x'.repeat(500);
    const { report, diagnostics } = mapStandardParts(parts({ verdict: { title: long, strengths: [long, long, long, long] } }), research, []);
    expect(report.title.length).toBeLessThanOrEqual(80);
    expect(report.swot.strengths).toHaveLength(3);
    expect(report.risks).toHaveLength(3);
    expect(report.risks[2].validation_method).toBeTruthy();
    expect(diagnostics.truncated).toContain('title');
  });

  it('a score without a basis is kept as an assumption; a score with "insufficient" is dropped, never zero', () => {
    const { report } = mapStandardParts(parts({ verdict: { scores: [0, 90, 50, 50, 50, 50, 50, 50, 50], score_basis: ['insufficient', '', 'evidence', 'evidence', 'evidence', 'evidence', 'evidence', 'evidence', 'evidence'] } }), research, []);
    expect(report.scorecard[0]).toMatchObject({ score: null, basis: 'insufficient' });
    expect(report.scorecard[1]).toMatchObject({ score: 90, basis: 'assumption' });
  });

  it('an unrecognised verdict label is normalised and recorded', () => {
    const { report, diagnostics } = mapStandardParts(parts({ verdict: { verdict: 'Go for it' } }), research, []);
    expect(report.verdict.label).toBe('Refine before investing');
    expect(diagnostics.normalised).toContain('verdict:Go for it');
    expect(mapStandardParts(parts({ verdict: { verdict: 'reconsider the current approach' } }), research, []).report.verdict.label).toBe('Reconsider the current approach');
  });

  it('maps detailed parts into the nine fixed sections with tables', () => {
    const claims = { claim_texts: [], claim_kinds: [], claim_confidences: [], claim_source_ids: [] };
    const empty = (n: number) => ({ [`s${n}_heading`]: '', [`s${n}_paragraphs`]: [], [`s${n}_bullets`]: [], [`s${n}_table_columns`]: [], [`s${n}_table_rows`]: [] });
    const first = GENERATION_SCHEMAS['detailed.sections'].parse({
      s1_heading: 'Market', s1_paragraphs: ['p'], s1_bullets: [], s1_table_columns: [], s1_table_rows: [],
      s2_heading: 'Segments', s2_paragraphs: [], s2_bullets: ['b'], s2_table_columns: [], s2_table_rows: [],
      ...claims,
    });
    const second = GENERATION_SCHEMAS['detailed.sections'].parse({
      s1_heading: 'Competitors', s1_paragraphs: ['p'], s1_bullets: [], s1_table_columns: ['Name', 'Price', 'Notes'], s1_table_rows: [['A', '£30', 'x', 'extra cell dropped'], ['B', '£35']],
      ...empty(2),
      ...claims,
    });
    const summary: DetailedParts['summary'] = GENERATION_SCHEMAS['detailed.summary'].parse({
      title: 'Detailed', executive_summary: ['One'],
      finance_known: [true, true, true, true, true, true], finance_values: [40, 8, 500, 1, 2, 3], finance_basis: Array(6).fill('assumption'), finance_notes: Array(6).fill(''), price_unit: 'sale',
      sensitivity_changes: ['price −10%'], sensitivity_effects: ['margin falls'],
      source_ids_used: [2], source_uses: ['pricing'], limitations: [],
      ...claims,
    });
    const { report, diagnostics } = mapDetailedParts({ sections: [first, second, GENERATION_SCHEMAS['detailed.sections'].parse({ ...empty(1), ...empty(2), ...claims })], summary }, research);
    expect(DetailedReportSchema.safeParse(report).success).toBe(true);
    expect(report.sections.map((s) => s.id)).toHaveLength(9);
    const comp = report.sections.find((s) => s.id === 'competitors')!;
    expect(comp.table?.columns).toEqual(['Name', 'Price', 'Notes']);
    expect(comp.table?.rows[0]).toHaveLength(3);
    expect(report.sections.find((s) => s.id === 'roadmap')!.paragraphs[0]).toMatch(/could not be generated/);
    expect(report.sources[0]).toMatchObject({ url: 'https://example.org/b', claim_type: 'forecast', published_date: null });
    expect(report.executive_summary).toHaveLength(3);
    expect(diagnostics.normalised).toContain('section:sensitivity_risks:missing');
    expect(report.sections.find((s) => s.id === 'pricing_route_to_market')!.heading).toBe('pricing route to market');
  });
});

/* ------------------------------------------------------------------ 4 --- */

const GRAMMAR_MESSAGE = 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.';

function apiError(status: 400 | 429, message: string, requestId = 'req_011Cg6CEUVVA1hXsnDuoXcHH') {
  const body = { type: 'error', error: { type: status === 429 ? 'rate_limit_error' : 'invalid_request_error', message } };
  const headers = new Headers({ 'request-id': requestId });
  return status === 429 ? new RateLimitError(429, body, message, headers) : new BadRequestError(400, body, message, headers);
}

describe('Classifying Anthropic API errors', () => {
  it('HTTP 400 "compiled grammar is too large" is non-retryable with a sanitised diagnostic', () => {
    const err = classifyApiError(apiError(400, GRAMMAR_MESSAGE), 'compose_standard');
    expect(err).toBeInstanceOf(GenerationRequestError);
    const d = (err as GenerationRequestError).diagnostic;
    expect(d).toMatchObject({ stage: 'compose_standard', status: 400, request_id: 'req_011Cg6CEUVVA1hXsnDuoXcHH', error_type: 'invalid_request_error' });
    expect(d.message).toContain('compiled grammar is too large');
    expect(d.message.length).toBeLessThanOrEqual(200);
    expect(err.message).toContain('grammar_too_large');
    expect(JSON.stringify(d)).not.toMatch(/sk-ant|api[_-]?key/i);
  });

  it('rate limits and server errors stay retryable', () => {
    expect(classifyApiError(apiError(429, 'Rate limited'), 'compose_standard')).not.toBeInstanceOf(GenerationRequestError);
    expect(classifyApiError(new Error('ECONNRESET'), 'research')).not.toBeInstanceOf(GenerationRequestError);
  });

  it('extractJson finds the object inside prose', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('nothing')).toBeNull();
  });
});

/** A fake API: grammar requests get the 400; the fallback (no format) gets JSON text. */
function grammarRejectingClient(opts: { rejectFallbackOnce?: boolean } = {}) {
  const bodies: Record<string, unknown>[] = [];
  let badFallbacks = opts.rejectFallbackOnce ? 1 : 0;
  const sse = (text: string) => {
    const events = [
      { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ];
    return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  };
  const sampleFor = (props: Record<string, { type?: string; items?: { type?: string } }>) => {
    const o: Record<string, unknown> = {};
    const special: Record<string, unknown> = { verdict: 'Worth testing', scores: [3, 3, 3, 3, 3], chart_kind: 'none', finance_known: [true, true, true, true, true, true], finance_values: [10, 2, 100, 5, 10, 20], risks: ['a', 'b', 'c'], improvements: ['a', 'b', 'c', 'd', 'e'] };
    for (const [p, def] of Object.entries(props)) o[p] = p in special ? special[p] : def.type === 'string' ? `${p} text` : def.type === 'number' ? 100 : def.type === 'boolean' ? true : [];
    return o;
  };
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    const format = body.output_config?.format;
    if (format) {
      return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: GRAMMAR_MESSAGE } }), { status: 400, headers: { 'content-type': 'application/json', 'request-id': 'req_fake' } });
    }
    const text = String(body.messages[0].content[1].text);
    const schema = JSON.parse(text.slice(text.indexOf('{"type":"object"')).split('\n')[0]) as { properties: Record<string, { type?: string }> };
    if (badFallbacks > 0) {
      badFallbacks -= 1;
      return new Response(sse('Sure! {"title": 1}'), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(sse(`Here is the JSON:\n${JSON.stringify(sampleFor(schema.properties))}`), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return { bodies, gen: new AnthropicGenerator('sk-ant-test-placeholder', 'claude-opus-5-5', { fetch, maxRetries: 0 }) };
}

describe('Grammar fallback', () => {
  it('a part rejected as too large is regenerated without a grammar and validated; the report still builds', async () => {
    const { bodies, gen } = grammarRejectingClient();
    const out = await gen.composeStandard(brief, research, 'notes', { tighten: 0 });
    expect(out.fallbacks).toEqual(['standard.verdict', 'standard.finance', 'standard.action']);
    expect(StandardReportSchema.safeParse(out.report).success).toBe(true);
    expect(out.report.verdict.label).toBe('Worth testing');
    // 3 grammar attempts + 3 fallbacks; fallbacks carry no format and quote the schema.
    expect(bodies).toHaveLength(6);
    const fallbacks = bodies.filter((b) => !(b.output_config as { format?: unknown }).format);
    expect(fallbacks).toHaveLength(3);
    for (const b of fallbacks) expect(String((b.messages as { content: { text: string }[] }[])[0].content[1].text)).toContain('"additionalProperties":false');
    expect(out.usage.input_tokens).toBe(30);
  });

  it('an invalid fallback answer is retried once with the validation errors', async () => {
    const { bodies, gen } = grammarRejectingClient({ rejectFallbackOnce: true });
    const out = await gen.composeStandard(brief, research, 'notes', { tighten: 0 });
    expect(out.fallbacks).toHaveLength(3);
    expect(bodies).toHaveLength(7);
    const retry = bodies.find((b) => String((b.messages as { content: { text: string }[] }[])[0].content[1].text).includes('previous answer was rejected'));
    expect(retry).toBeDefined();
  });

  it('other 400s are not retried without a grammar', async () => {
    const { bodies, gen } = captureClient();
    await expect(gen.composeStandard(brief, [], '', { tighten: 0 })).rejects.toBeInstanceOf(GenerationRequestError);
    expect(bodies.every((b) => (b.output_config as { format?: unknown }).format)).toBe(true);
  });
});

/* ------------------------------------------------------------------ 5 --- */

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
    expect(final.checkpoint.api_error).toMatchObject({ stage: 'compose_standard', status: 400, request_id: 'req_stub', build: { context: expect.any(String) } });
    expect(final.last_error).toContain('grammar_too_large');
    expect(h.generator.composeCalls).toBe(1);
    expect(h.generator.researchCalls).toBe(1);
    expect((await h.db.getReport(order.id))!.status).toBe('failed');
    expect((await h.db.getOrder(order.id))!.status).toBe('failed');
    expect(await h.db.getResearchSources(order.id)).not.toHaveLength(0);
    expect(h.mailer.sent.map((m) => m.subject)).toHaveLength(1);
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
