import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateDoc, schemaIds, SCHEMA_DIR } from '../src/schemas.ts';
import { renderSchemas } from '../tools/gen-schemas.ts';
import { buildRecordFixtures } from '../tools/gen-test-fixtures.ts';
import { canonicalFile, canonicalJson, hashOf } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const REC = join(TEST_DIR, 'fixtures', 'records');

test('schema files on disk equal the generated definitions (no drift)', () => {
  for (const [name, text] of renderSchemas()) assert.equal(readFileSync(join(SCHEMA_DIR, name), 'utf8'), text, name);
  assert.equal(readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json')).length, renderSchemas().size);
});

test('every entity of the data model has a schema, including the approved v1.1 versions', () => {
  const need = ['aebs.suite/1', 'aebs.category/1', 'aebs.scenario/1', 'aebs.case/1', 'aebs.case/2', 'aebs.fixture/1', 'aebs.assertion/1',
    'aebs.profile/1', 'aebs.profile/2', 'aebs.run/1', 'aebs.attempt/1', 'aebs.attempt/2', 'aebs.tool_event/1', 'aebs.policy_decision/1',
    'aebs.policy_decision/2', 'aebs.evidence/1', 'aebs.verification/1', 'aebs.metric/1', 'aebs.failure/1', 'aebs.environment/1',
    'aebs.artifact/1', 'aebs.calibration/1'];
  for (const s of need) assert.ok(schemaIds().includes(s), s);
});

test('committed valid record fixtures validate; invalid ones are rejected', () => {
  for (const f of readdirSync(join(REC, 'valid'))) {
    assert.deepEqual(validateDoc(JSON.parse(readFileSync(join(REC, 'valid', f), 'utf8'))), [], f);
  }
  const violations = JSON.parse(readFileSync(join(REC, 'invalid', 'VIOLATIONS.json'), 'utf8'));
  for (const f of readdirSync(join(REC, 'invalid')).filter((x) => x !== 'VIOLATIONS.json')) {
    assert.ok(validateDoc(JSON.parse(readFileSync(join(REC, 'invalid', f), 'utf8'))).length > 0, `${f} should violate: ${violations[f.replace(/\.json$/, '')]}`);
  }
});

test('record fixtures are deterministic and equal the committed files', () => {
  const a = buildRecordFixtures(), b = buildRecordFixtures();
  assert.equal(canonicalJson(a), canonicalJson(b));
  for (const [name, doc] of Object.entries(a.valid)) assert.equal(readFileSync(join(REC, 'valid', `${name}.json`), 'utf8'), canonicalFile(doc), name);
});

test('unknown major versions and malformed schema ids are rejected', () => {
  assert.match(validateDoc({ schema: 'aebs.attempt/9' })[0].message, /unknown schema or major/);
  assert.match(validateDoc({ schema: 'attempt' })[0].message, /malformed/);
  assert.match(validateDoc([])[0].message, /object/);
});

test('canonical serialization is key-order independent and hashes are stable', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(hashOf({ a: 1 }), hashOf({ a: 1 }));
  assert.match(hashOf({ a: 1 }), /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => canonicalJson({ x: NaN }));
});
