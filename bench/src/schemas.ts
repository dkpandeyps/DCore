// Schema registry and document validation.
// Documents carry "schema": "aebs.<entity>/<major>"; readers MUST reject unknown majors (data model §1).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry, type SchemaError } from './jsonschema.ts';

export const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

let registry: SchemaRegistry | null = null;

export function loadRegistry(dir = SCHEMA_DIR): SchemaRegistry {
  const r = new SchemaRegistry();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.schema.json')).sort()) {
    r.add(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  }
  return r;
}

function reg(): SchemaRegistry {
  registry ??= loadRegistry();
  return registry;
}

export class SchemaValidationError extends Error {
  errors: SchemaError[];
  constructor(schemaId: string, errors: SchemaError[]) {
    super(`${schemaId}: ${errors.slice(0, 5).map((e) => `${e.path} ${e.message}`).join('; ')}`);
    this.errors = errors;
  }
}

export function validateDoc(doc: unknown): SchemaError[] {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return [{ path: '$', message: 'document must be an object' }];
  const id = (doc as Record<string, unknown>).schema;
  if (typeof id !== 'string' || !/^aebs\.[a-z_]+\/\d+$/.test(id)) return [{ path: '$.schema', message: 'missing or malformed schema id' }];
  if (!reg().has(id)) return [{ path: '$.schema', message: `unknown schema or major version ${id}` }];
  return reg().validate(id, doc);
}

export function assertValid<T>(doc: T): T {
  const errors = validateDoc(doc);
  if (errors.length) throw new SchemaValidationError(String((doc as any)?.schema), errors);
  return doc;
}

export function schemaIds(): string[] {
  return reg().ids();
}
