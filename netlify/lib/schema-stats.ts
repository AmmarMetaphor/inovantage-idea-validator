/*
  Size metrics for the JSON Schema the SDK sends as output_config.format.
  The API compiles that schema into a grammar; too much structure (length
  constraints, enums, unions, nesting) produces HTTP 400 "The compiled
  grammar is too large". Used by tests/generation.test.ts and
  scripts/dump-generation-schema.mts (npm run schema:dump).
*/
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ZodType } from 'zod';

export function schemaStats(name: string, schema: ZodType) {
  const fmt = zodOutputFormat(schema) as unknown as { schema: unknown };
  const s = JSON.stringify(fmt.schema ?? fmt);
  const count = (k: string) => (s.match(new RegExp(`"${k}"`, 'g')) ?? []).length;
  let depth = 0;
  let max = 0;
  for (const ch of s) {
    if (ch === '{' || ch === '[') {
      depth += 1;
      max = Math.max(max, depth);
    } else if (ch === '}' || ch === ']') depth -= 1;
  }
  const enumValues = (s.match(/"enum":\[[^\]]*\]/g) ?? []).reduce((n, e) => n + e.split(',').length, 0);
  const result = { name, bytes: s.length, maxLength: count('maxLength'), minLength: count('minLength'), minItems: count('minItems'), maxItems: count('maxItems'), minimum: count('minimum'), maximum: count('maximum'), enums: count('enum'), enumValues, anyOf: count('anyOf'), objects: count('properties'), nesting: max };
  return { result, json: s };
}

