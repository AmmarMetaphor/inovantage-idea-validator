/*
  Diagnostic: print the exact JSON Schema the SDK sends as
  output_config.format for each generation request, with size metrics.
  The API compiles this into a grammar; too much structure (length
  constraints, enums, unions, nesting) produces
  "The compiled grammar is too large". Run: npm run schema:dump
*/
import type { ZodType } from 'zod';
import { schemaStats } from '../netlify/lib/schema-stats';

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const which = process.argv[2] ?? 'all';
  const mods = await Promise.all([import('../netlify/lib/report-schema'), import('../netlify/lib/generation-schema')]);
  const [app, gen] = mods;
  const targets: [string, ZodType][] = [];
  if (which === 'all' || which === 'app') targets.push(['app:StandardReportSchema', app.StandardReportSchema], ['app:DetailedReportSchema', app.DetailedReportSchema]);
  if (which === 'all' || which === 'gen') for (const [k, schema] of Object.entries(gen.GENERATION_SCHEMAS)) targets.push([`gen:${k}`, schema]);
  for (const [name, schema] of targets) {
    const { result, json } = schemaStats(name, schema);
    console.log(JSON.stringify(result));
    if (process.argv.includes('--print')) console.log(json);
  }
}
