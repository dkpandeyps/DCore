import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SUPPORTED_PLATFORMS, DEFAULT_ENFORCEMENT_LEVEL, buildFacetCatalogue, normalizeHost, resolveUniversal,
  buildUniversalCompatibility, universalToM8, universalToM9, buildAuditRecord, verifyAuditChain,
} from '../compatibility/universal-compatibility.ts';
import * as G from '../tools/gen-universal-compatibility-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { evaluateEvidenceExecutionGate } from '../compatibility/evidence-execution.ts';
import { fixtures as execFixtures } from '../tools/gen-evidence-execution-sample.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;

test('1. schema + universal descriptor + pipeline', () => {
  const u = buildUniversalCompatibility();
  assert.equal(u.schema, 'dkskill.universal_compatibility/1');
  assert.deepEqual(u.supported_platforms, ['windows', 'macos', 'linux']);
  assert.equal(u.default_enforcement_level, 'L1');
  assert.equal(u.latest_certified_policy, 'latest-3');
  assert.ok(u.pipeline.includes('HOST_IDENTITY') && u.pipeline.includes('FAIL_CLOSED_DECISION'));
  assert.deepEqual(u.attribution_valid_for, ['2.1.283']);
});

test('2. facet catalogue explicit (5 families)', () => {
  const fc = buildFacetCatalogue();
  assert.equal(fc.length, 5);
  assert.ok(fc.every((x) => x.schema === 'dkskill.host_facet/1'));
  assert.ok(fc.some((x) => x.facet_id === 'attribution@1'));
});

test('3,4,5. Windows/macOS/Linux certified => COMPATIBLE (one universal core)', () => {
  assert.equal(f.windowsCertified().outcome, 'COMPATIBLE');
  assert.equal(f.macosCertified().outcome, 'COMPATIBLE');
  assert.equal(f.linuxCertified().outcome, 'COMPATIBLE');
  assert.equal(f.windowsCertified().schema, 'dkskill.user_compatibility_result/1');
});

test('6,7. x64 + arm64 independently identified', () => {
  assert.equal(f.windowsCertified().normalized_identity.architecture, 'x64');
  assert.equal(f.macosCertified().normalized_identity.architecture, 'arm64');
  assert.equal(f.macosCertified().platform, 'macos');
});

test('8. version mismatch => UNVERIFIED (no version inheritance)', () => {
  assert.equal(f.versionMismatch().outcome, 'UNVERIFIED');
  assert.equal(f.versionMismatch().profile_resolution, 'NO_MATCH');
});

test('9. platform mismatch / unknown OS => UNSUPPORTED', () => {
  assert.equal(f.platformMismatch().outcome, 'UNSUPPORTED');
  assert.equal(f.platformMismatch().supported_platform, false);
});

test('10. architecture mismatch => UNVERIFIED (no x64->arm64 inheritance)', () => {
  assert.equal(f.architectureMismatch().outcome, 'UNVERIFIED');
});

test('11. channel mismatch => UNVERIFIED (no channel inheritance)', () => {
  assert.equal(f.channelMismatch().outcome, 'UNVERIFIED');
});

test('12. binary hash mismatch => UNVERIFIED (exact binary required)', () => {
  assert.equal(f.binaryHashMismatch().outcome, 'UNVERIFIED');
  assert.equal(f.binaryHashMismatch().profile_resolution, 'NO_MATCH');
});

test('13. unknown host => UNSUPPORTED; incomplete identity => PROFILE_NOT_FOUND', () => {
  assert.equal(f.unknownHost().outcome, 'UNSUPPORTED');
  assert.equal(f.incompleteIdentity().outcome, 'PROFILE_NOT_FOUND');
});

test('14. safety-critical unverified capability => BLOCKED (fail closed)', () => {
  assert.equal(f.safetyCapBlocked().outcome, 'BLOCKED');
  assert.ok(f.safetyCapBlocked().reason_codes.includes('SAFETY_CRITICAL_UNVERIFIED'));
});

test('15. unknown/unresolved facet => PARTIALLY_COMPATIBLE (never silently compatible)', () => {
  assert.equal(f.unknownFacet().outcome, 'PARTIALLY_COMPATIBLE');
});

test('16. attribution out of scope surfaced (no attr@2, no guessing)', () => {
  const r = f.attributionOutOfScope();
  assert.equal(r.attribution.in_scope, false);
  assert.ok(r.unknown.some((u) => /attribution out of/i.test(u)));
});

test('17. revoked profile => REVOKED', () => {
  assert.equal(f.revokedProfile().outcome, 'REVOKED');
  assert.equal(f.revokedProfile().profile_resolution, 'REVOKED_PROFILE');
});

test('18. superseded profile not COMPATIBLE (=> UNVERIFIED, not certified)', () => {
  assert.equal(f.supersededProfile().outcome, 'UNVERIFIED');
  assert.equal(f.supersededProfile().certification_status, 'SUPERSEDED');
});

test('19. ambiguous profile => PROFILE_MISMATCH', () => {
  assert.equal(f.ambiguousProfile().outcome, 'PROFILE_MISMATCH');
  assert.equal(f.ambiguousProfile().profile_resolution, 'AMBIGUOUS_MATCH');
});

test('20. NOT_YET_VALIDATED never becomes VERIFIED via inference; UNVERIFIED != UNSUPPORTED', () => {
  const prod = f.productionUnverified();
  assert.equal(prod.outcome, 'UNVERIFIED');                 // exact match but not certified
  assert.notEqual(prod.outcome, 'UNSUPPORTED');
  assert.equal(prod.certification_status, 'NOT_CERTIFIED');
});

test('21. fail-closed + actionable explanation (known/unknown)', () => {
  for (const k of Object.keys(f) as (keyof typeof f)[]) {
    const r = f[k]();
    assert.equal(r.fail_closed, true);
    assert.ok(typeof r.explanation === 'string' && r.explanation.length > 0, k);
  }
  assert.ok(f.windowsCertified().known.length > 0);
  assert.ok(f.versionMismatch().unknown.length > 0);
});

test('22. never claims "works everywhere"; each platform needs its own evidence', () => {
  const blob = canonicalFile(buildUniversalCompatibility()) + Object.keys(f).map((k) => canonicalFile((f as any)[k]())).join('');
  assert.ok(!/works everywhere/i.test(blob));
  // macOS compatibility does not imply windows arm64 compatibility (independent)
  assert.equal(f.macosCertified().outcome, 'COMPATIBLE');
  assert.equal(f.architectureMismatch().outcome, 'UNVERIFIED');
});

test('23,24. M8/M9 fail-closed integration; unmodified M8 stays BLOCKED', () => {
  assert.equal(universalToM8(), 'UNVERIFIED');
  assert.equal(universalToM9(), 'UNVERIFIED');
  const req = { ...execFixtures.currentReal(), network: { ...execFixtures.currentReal().network, isolation_status: universalToM8() } };
  assert.equal(evaluateEvidenceExecutionGate(req).decision, 'EXECUTION_BLOCKED');
});

test('25. production registry immutability: real host UNVERIFIED, prod certified count zero', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  f.windowsCertified(); f.productionUnverified();
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
});

test('26. synthetic_test_only labeling; audit chain', () => {
  assert.equal(f.windowsCertified().synthetic_test_only, true);
  assert.equal(f.productionUnverified().synthetic_test_only, false);
  const a1 = buildAuditRecord(f.windowsCertified(), G.FIXED(), null);
  const a2 = buildAuditRecord(f.macosCertified(), G.FIXED(), a1.record_hash!);
  assert.equal(verifyAuditChain([a1, a2]), true);
  assert.equal(verifyAuditChain([{ ...a1, outcome: 'UNSUPPORTED' as const }, a2]), false);
});

test('27. normalizeHost via adapter; no baked platform behavior', () => {
  const n = normalizeHost({ product: 'claude-code', version: '2.1.283', os: 'darwin', os_version: null, architecture: 'arm64', channel: 'native', binary_sha256: 'x', runtime_facet: null });
  assert.equal(n.platform, 'macos');
  assert.equal(n.identity.platform, 'darwin');   // registry token
  assert.equal(n.supported, true);
  assert.equal(normalizeHost({ product: 'p', version: '1', os: 'plan9', os_version: null, architecture: 'x64', channel: 'native', binary_sha256: 'x', runtime_facet: null }).supported, false);
});

test('28. deterministic output; committed == fresh; /runtime absent; no secrets', () => {
  assert.equal(canonicalFile(f.windowsCertified()), canonicalFile(f.windowsCertified()));
  assert.equal(readFileSync(join(DIR, 'uc-sample-windows-compatible.json'), 'utf8'), canonicalFile(f.windowsCertified()));
  assert.equal(readFileSync(join(DIR, 'universal-compatibility.json'), 'utf8'), canonicalFile(buildUniversalCompatibility()));
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6})/i.test(canonicalFile(f.windowsCertified())));
});
