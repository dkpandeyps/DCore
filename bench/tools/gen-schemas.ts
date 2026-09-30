// Writes bench/schemas/*.schema.json from src/schema-defs.ts (deterministic output).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMAS, schemaFileName } from '../src/schema-defs.ts';
import { canonicalFile } from '../src/canonical.ts';
import { SCHEMA_DIR } from '../src/schemas.ts';

export function renderSchemas(): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of SCHEMAS) out.set(schemaFileName(s.$id), canonicalFile(s));
  return out;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('gen-schemas.ts')) {
  mkdirSync(SCHEMA_DIR, { recursive: true });
  for (const [name, text] of renderSchemas()) writeFileSync(join(SCHEMA_DIR, name), text);
  console.log(`wrote ${SCHEMAS.length} schema files to ${SCHEMA_DIR}`);
}
