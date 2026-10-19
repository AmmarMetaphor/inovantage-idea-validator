/*
  Diagnostic: capture the EXACT HTTP request body the compose stage sends to
  Anthropic (model, output_config.format, tools, system, message sizes) by
  running AnthropicGenerator against a fake fetch. No network, no key needed.
  Run: npx tsx scripts/capture-compose-request.mts [--print]
*/
import { AnthropicGenerator, buildBrief } from '../netlify/lib/research';
import { validAnswers } from '../tests/helpers';

const captured: { url: string; body: Record<string, unknown> }[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  captured.push({ url: String(input), body: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'captured' } }), { status: 400, headers: { 'content-type': 'application/json', 'request-id': 'req_capture' } });
};

const gen = new AnthropicGenerator('sk-ant-placeholder', 'claude-opus-5-5', { fetch: fakeFetch, maxRetries: 0 });
const brief = buildBrief({ orderRef: 'CAPTURE', market: 'UK', currency: 'GBP', ideaName: 'Capture', answers: validAnswers(), answersVersion: 3 });
for (const [name, run] of [
  ['compose_standard', () => gen.composeStandard(brief, [], '', { tighten: 0 })],
  ['compose_detailed', () => gen.composeDetailed(brief, [], '', null)],
] as const) {
  captured.length = 0;
  await run().catch(() => undefined);
  for (const req of captured) {
    const b = req.body;
    const format = (b.output_config as { format?: { schema?: { properties?: object } } } | undefined)?.format;
    const tools = (b.tools as unknown[] | undefined) ?? [];
    const strictTools = tools.filter((t) => (t as { strict?: boolean }).strict === true);
    console.log(JSON.stringify({ name, url: req.url, model: b.model, stream: b.stream, max_tokens: b.max_tokens, output_config_keys: Object.keys((b.output_config as object) ?? {}), format_type: (format as { type?: string })?.type, format_bytes: JSON.stringify(format).length, format_properties: Object.keys(format?.schema?.properties ?? {}).length, tools: tools.length, strict_tools: strictTools.length, system_bytes: JSON.stringify(b.system).length, messages_bytes: JSON.stringify(b.messages).length, body_keys: Object.keys(b) }));
    if (process.argv.includes('--print')) console.log(JSON.stringify(format));
  }
}
