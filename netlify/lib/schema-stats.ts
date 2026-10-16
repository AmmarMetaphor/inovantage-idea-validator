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
  const parsed = JSON.parse(s) as unknown;
  let properties = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'properties' && v && typeof v === 'object') properties += Object.keys(v as object).length;
        walk(v);
      }
    }
  };
  walk(parsed);
  const result = { name, bytes: s.length, properties, maxLength: count('maxLength'), minLength: count('minLength'), minItems: count('minItems'), maxItems: count('maxItems'), minimum: count('minimum'), maximum: count('maximum'), enums: count('enum'), enumValues, anyOf: count('anyOf'), objects: count('properties'), nesting: max };
  return { result, json: s };
}

