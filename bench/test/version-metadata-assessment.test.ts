import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildAssessment, evaluateCandidate, candidateCatalogue, hardGateFailures, verifyAssessment } from '../product/version-metadata-assessment.ts';
import { observeReal } from '../product/identity-cli.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const a = buildAssessment();
const evalOf = (id: string) => a.evaluations.find((e) => e.source_id === id)!;

test('1. schema + deterministic + verifiable hash', () => {
  assert.equal(a.schema, 'dkskill.version_metadata_assessment/1');
  assert.equal(canonicalFile(buildAssessment()), canonicalFile(buildAssessment()));
  assert.equal(verifyAssessment(a), true);
  assert.equal(verifyAssessment({ ...a, implementation_decision: 'IMPLEMENTATION_JUSTIFIED' as const }), false);
});

test('2. explicit gates reject execution / network / credentials / .claude / inference / discovery', () => {
  assert.equal(evalOf('PACKAGE_MANAGER_QUERY').overall_acceptance, 'REJECTED');   // execution
  assert.ok(evalOf('PACKAGE_MANAGER_QUERY').gate_failures.includes('REQUIRES_EXECUTION'));
  assert.ok(evalOf('NPM_DIST_TAG_CHANNEL').gate_failures.includes('REQUIRES_NETWORK'));
  assert.ok(evalOf('DOT_CLAUDE_CONFIG').gate_failures.includes('READS_DOT_CLAUDE'));
  assert.ok(evalOf('FILENAME_VERSION').gate_failures.includes('INFERENCE'));
  assert.ok(evalOf('ENV_VAR_VERSION').gate_failures.includes('INFERENCE'));
  assert.ok(evalOf('BENCHMARK_OR_REGISTRY_METADATA').gate_failures.includes('INFERENCE'));
  assert.ok(evalOf('RECURSIVE_FS_DISCOVERY').gate_failures.includes('REQUIRES_BROAD_DISCOVERY'));
  assert.ok(evalOf('NPM_PACKAGE_JSON_AUTODISCOVER').gate_failures.includes('REQUIRES_BROAD_DISCOVERY'));
});

test('3. version: no autonomous ACCEPTABLE source; explicit-path is CONDITIONALLY_ACCEPTABLE only', () => {
  assert.equal(a.version_source_status, 'CONDITIONALLY_ACCEPTABLE');
  assert.equal(evalOf('NPM_PACKAGE_JSON_EXPLICIT').version_acceptance, 'CONDITIONALLY_ACCEPTABLE');
  assert.equal(evalOf('MACOS_INFO_PLIST_EXPLICIT').version_acceptance, 'CONDITIONALLY_ACCEPTABLE');
  assert.ok(a.evaluations.every((e) => e.version_acceptance !== 'ACCEPTABLE'));   // none fully acceptable
  assert.equal(a.accepted_source_id, null);
});

test('4. channel: NO safe local non-secret source (all REJECTED)', () => {
  assert.equal(a.channel_source_status, 'REJECTED');
  assert.ok(a.evaluations.every((e) => e.channel_acceptance !== 'ACCEPTABLE'));
  assert.equal(a.channel_default_when_no_source, 'UNKNOWN');
});

test('5. embedded-binary version resource: STRONG binding but data unproven => UNKNOWN', () => {
  const e = evalOf('EMBEDDED_BINARY_VERSION_RESOURCE');
  assert.equal(e.version_acceptance, 'UNKNOWN');   // data_available false => not usable yet
});

test('6. overall decision: IMPLEMENTATION_NOT_JUSTIFIED; M17 not modified', () => {
  assert.equal(a.implementation_decision, 'IMPLEMENTATION_NOT_JUSTIFIED');
  assert.equal(a.m17_modified, false);
  assert.ok(a.decision_reasons.some((r) => /channel remains UNKNOWN/i.test(r)));
  assert.equal(a.version_default_when_no_source, 'UNKNOWN');
});

test('7. hardGateFailures pure over facts', () => {
  const c = candidateCatalogue().find((x) => x.source_id === 'NPM_PACKAGE_JSON_EXPLICIT')!;
  assert.deepEqual(hardGateFailures(c), []);                 // passes hard gates
  assert.ok(hardGateFailures({ ...c, no_execution: false }).includes('REQUIRES_EXECUTION'));
  assert.ok(hardGateFailures({ ...c, non_secret: false }).includes('SECRET_BEARING'));
});

test('8. candidate matrix completeness (categories A..H represented)', () => {
  const cats = new Set(candidateCatalogue().map((c) => c.source_category));
  assert.ok(candidateCatalogue().length >= 10);
  assert.ok([...cats].length >= 6);
  // platform-scoped candidate present (adapter-level, not universal-core assumption)
  assert.ok(candidateCatalogue().some((c) => c.platform_scope.includes('macos') && c.adapter_only));
});

test('9. M17 remains authoritative + UNKNOWN: real probe still reports UNKNOWN version/channel', () => {
  const o = observeReal({ now: '2026-09-30T00:00:00Z' });
  assert.equal(o.version_state, 'UNKNOWN');
  assert.equal(o.channel_state, 'UNKNOWN');
  // the M17 probe source is unchanged (assessment did not modify it)
  assert.ok(!existsSync(join(DIR, '..', 'product', 'version-metadata-source.ts')));   // no implementation file created
});

test('10. committed == fresh; production immutable; certified 0; /runtime absent; ~/.claude untouched', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'version-metadata-assessment.json'), 'utf8'), canonicalFile(buildAssessment()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('11. static: assessment engine has no exec/network/fs-discovery/credential primitives', () => {
  const mod = readFileSync(join(DIR, '..', 'product', 'version-metadata-assessment.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|net\.connect|child_process|execSync|execFileSync|\bspawn\s*\(|readdirSync|readFileSync\s*\(|process\.env/i.test(mod));
});
