import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { staticIdentityProbe, evaluateHost, resolveProfile, coreSafetyFeature, FACET_FAMILIES } from '../compatibility/hcl.ts';
import { sampleResult, sampleJson } from '../tools/gen-hcl-sample.ts';
import { buildRegistry, type Registry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { buildEquivalence } from '../tools/gen-attribution-equivalence.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const ID283 = { product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A' };
const probe = (o: Record<string, unknown>) => staticIdentityProbe(o as any);
const evalId = (o: Record<string, unknown>, extra: Record<string, unknown> = {}) => evaluateHost({ probe: probe(o), ...extra } as any);

// A synthetic registry with a fully-VERIFIED CERTIFIED profile (test fixture only; not a real host).
function certifiedRegistry(): Registry {
  const reg = buildRegistry();
  const base = reg.profiles.find((p) => p.version === '2.1.283')!;
  const allVerified: Record<string, string> = {};
  for (const c of buildCatalogue().capabilities) allVerified[c.id] = 'VERIFIED';
  const certified = { ...base, profile_id: 'test-certified@1', version: '9.9.9', capability_refs: allVerified, validation_status: 'CERTIFIED', certification_status: 'CERTIFIED', certification: { certified: true, authority: 'TEST', certified_at: '2026-01-01', certification_review_ref: 'TEST-REVIEW' } };
  return { ...reg, profiles: [...reg.profiles, certified as any] };
}
const CERT_ID = { product: 'claude-code', version: '9.9.9', platform: 'win32', architecture: 'x64', channel: 'native', binary_sha256: ID283.binary_sha256 };

test('1. exact known profile resolves (EXACT_MATCH)', () => {
  const r = evalId(ID283);
  assert.equal(r.profile_resolution, 'EXACT_MATCH');
  assert.equal(r.profile_id, 'cc-2.1.283-win32-x64-native@1');
  assert.equal(r.validation_status, 'PROBED');
});

test('2,3,4. unknown version/platform/channel refuse enforcement (NO_MATCH)', () => {
  // versions/platforms/channels with NO registered profile at all
  for (const o of [{ ...ID283, version: '2.1.285', binary_sha256: null }, { ...ID283, platform: 'linux' }, { ...ID283, channel: 'brew' }]) {
    const r = evalId(o);
    assert.equal(r.profile_resolution, 'NO_MATCH', JSON.stringify(o));
    assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
  }
});

test('5,23. hash mismatch refuses exact match; exact hash participates', () => {
  const r = evalId({ ...ID283, binary_sha256: '0'.repeat(64) });
  assert.equal(r.profile_resolution, 'NO_MATCH');
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
});

test('6. ambiguous profiles refuse resolution', () => {
  const reg = buildRegistry();
  const p = reg.profiles.find((x) => x.version === '2.1.283')!;
  const dup = { ...p, profile_id: 'cc-2.1.283-win32-x64-native@dup' };
  const amb: Registry = { ...reg, profiles: [...reg.profiles, dup as any] };
  const r = resolveProfile(ID283 as any, amb);
  assert.equal(r.state, 'AMBIGUOUS_MATCH');
  assert.equal(evaluateHost({ probe: probe(ID283), registry: amb }).enforcement_decision, 'ENFORCEMENT_REFUSED');
});

test('7. revoked profile refuses enforcement', () => {
  const reg = buildRegistry();
  const profiles = reg.profiles.map((p) => p.version === '2.1.283' ? { ...p, revoked: true, lifecycle_state: 'revoked' } : p);
  const r = evaluateHost({ probe: probe(ID283), registry: { ...reg, profiles } as any });
  assert.equal(r.profile_resolution, 'REVOKED_PROFILE');
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
  assert.ok(r.reason_codes.some((c) => /REVOKED/.test(c)));
});

test('8. invalid registry (no matching profile) refuses enforcement', () => {
  const empty: Registry = { ...buildRegistry(), profiles: [] };
  const r = evaluateHost({ probe: probe(ID283), registry: empty });
  assert.equal(r.profile_resolution, 'NO_MATCH');
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
});

test('9,10. PROBED != CERTIFIED and NOT_VALIDATED != VERIFIED (283 refused; not certified)', () => {
  const r = evalId(ID283);
  assert.equal(r.certification_status, 'NOT_CERTIFIED');
  assert.notEqual(r.enforcement_decision, 'ENFORCEMENT_ALLOWED');
});

test('11,12. PARTIALLY_VERIFIED and DEGRADED_AT_RUNTIME are preserved (not promoted)', () => {
  const r = evalId(ID283);
  const mcp = r.capability_results.find((c) => c.capability_id === 'CAP-MCP-MATCHER')!;
  assert.equal(mcp.state, 'PARTIALLY_VERIFIED');   // preserved, not upgraded
  // inject a DEGRADED_AT_RUNTIME cap and confirm it is preserved verbatim
  const reg = buildRegistry();
  const profiles = reg.profiles.map((p) => p.version === '2.1.283' ? { ...p, capability_refs: { ...p.capability_refs, 'CAP-HOOK-HEARTBEAT': 'DEGRADED_AT_RUNTIME' } } : p);
  const r2 = evaluateHost({ probe: probe(ID283), registry: { ...reg, profiles } as any });
  assert.equal(r2.capability_results.find((c) => c.capability_id === 'CAP-HOOK-HEARTBEAT')!.state, 'DEGRADED_AT_RUNTIME');
});

test('13. unresolved critical capability refuses certified enforcement', () => {
  const r = evalId(ID283);
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
  assert.ok(r.reason_codes.some((c) => /CAP_UNMET:CAP-MCP-MATCHER/.test(c)));
});

test('14. unresolved optional capability yields DEGRADED only for an explicitly-optional feature', () => {
  const optionalFeature = { feature_id: 'opt', optional: true, required_capabilities: [{ cap_id: 'CAP-UPDATEDINPUT-NARROWING', min_state: 'VERIFIED' as const }], required_facets: [] };
  const r = evaluateHost({ probe: probe(ID283), feature: optionalFeature });
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_DEGRADED');
  // the same unmet cap on a non-optional feature refuses
  const req = { ...optionalFeature, optional: false };
  assert.equal(evaluateHost({ probe: probe(ID283), feature: req }).enforcement_decision, 'ENFORCEMENT_REFUSED');
});

test('15. unknown facet refuses dependent (non-optional) enforcement', () => {
  const reg = buildRegistry();
  const profiles = reg.profiles.map((p) => p.version === '2.1.283' ? { ...p, facet_refs: { ...p.facet_refs, hook_protocol: null } } : p);
  const feature = { feature_id: 'needs-hook', optional: false, required_capabilities: [], required_facets: ['hook_protocol'] };
  const r = evaluateHost({ probe: probe(ID283), registry: { ...reg, profiles } as any, feature });
  assert.equal(r.facet_results.find((f) => f.family === 'hook_protocol')!.state, 'UNRESOLVED');
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
});

test('16,17,18. attribution resolves only in scope; wrong version -> A9/unknown; no attr@2', () => {
  const inScope = evalId(ID283).attribution;
  assert.equal(inScope.facet, 'attribution@1');
  assert.equal(inScope.in_scope, true);
  assert.equal(inScope.real_host, 'NOT_VALIDATED');
  assert.deepEqual(inScope.table_valid_scope, ['2.1.283']);
  // an unmatched (unknown) host has no attribution facet / not in scope
  const off = evalId({ ...ID283, version: '2.1.284', binary_sha256: null }).attribution;
  assert.equal(off.in_scope, false);
  assert.match(off.note, /A9\/unknown|table_valid=false/);
  assert.ok(!/attr@2/.test(JSON.stringify(evalId(ID283))));
});

test('19,20,21,22. no nearest-version / no inheritance / no platform or channel substitution', () => {
  // 19. no nearest-version: a version with no profile does not resolve to a neighbor
  assert.equal(evalId({ ...ID283, version: '2.1.285', binary_sha256: null }).profile_id, null);
  // 20. no silent inheritance: 2.1.284 matches its OWN profile only; it inherits none of 2.1.283's capability states
  const r284 = evalId({ ...ID283, version: '2.1.284', binary_sha256: null });
  assert.equal(r284.profile_id, 'cc-2.1.284-win32-x64-native@1');
  assert.equal(r284.validation_status, 'NOT_VALIDATED');
  assert.equal(r284.enforcement_decision, 'ENFORCEMENT_REFUSED');
  for (const row of r284.capability_results) assert.equal(row.state, 'NOT_YET_VALIDATED', row.capability_id);
  // 21,22. platform/channel not substituted onto the win32/native profile
  assert.equal(evalId({ ...ID283, platform: 'darwin' }).profile_id, null);
  assert.equal(evalId({ ...ID283, channel: 'homebrew' }).profile_id, null);
});

test('24. diagnostics contain no secrets/credentials/tokens', () => {
  const s = JSON.stringify(evalId(ID283));
  assert.ok(!/(access_token|refresh_token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|"cookie"|bearer\s)/i.test(s));
});

test('25,26,27. self-check PASS/FAIL/NOT_RUN are represented; NOT_RUN != PASS; ALLOWED needs PASS', () => {
  const reg = certifiedRegistry();
  const pass = evaluateHost({ probe: probe(CERT_ID), registry: reg, selfChecks: [{ id: 'T2', description: 'heartbeat', critical: true, result: 'PASS' }] });
  assert.equal(pass.enforcement_decision, 'ENFORCEMENT_ALLOWED');
  const fail = evaluateHost({ probe: probe(CERT_ID), registry: reg, selfChecks: [{ id: 'T2', description: 'heartbeat', critical: true, result: 'FAIL' }] });
  assert.equal(fail.enforcement_decision, 'ENFORCEMENT_REFUSED');
  const notRun = evaluateHost({ probe: probe(CERT_ID), registry: reg, selfChecks: [{ id: 'T2', description: 'heartbeat', critical: true, result: 'NOT_RUN' }] });
  assert.equal(notRun.enforcement_decision, 'ENFORCEMENT_REFUSED');   // NOT_RUN is not PASS
});

test('28,29. all M0 capability IDs resolve; M1 profile references all resolve', () => {
  const m0 = new Set(buildCatalogue().capabilities.map((c) => c.id));
  const r = evalId(ID283);
  assert.equal(r.capability_results.length, m0.size);
  for (const row of r.capability_results) assert.ok(m0.has(row.capability_id), row.capability_id);
  const reg = buildRegistry();
  for (const p of reg.profiles) for (const id of Object.keys(p.capability_refs)) assert.ok(m0.has(id), id);
});

test('30. M2 attribution equivalence is consumed without mutation', () => {
  const before = canonicalFile(buildEquivalence());
  evalId(ID283);
  assert.equal(canonicalFile(buildEquivalence()), before);
});

test('31. H-Q1: UNVERIFIED (no exact profile) refuses enforcement and is not called UNSUPPORTED', () => {
  const r = evalId({ ...ID283, version: '3.0.0', binary_sha256: null });
  assert.equal(r.profile_resolution, 'NO_MATCH');
  assert.equal(r.enforcement_decision, 'ENFORCEMENT_REFUSED');
  assert.match(r.limitations.join(' '), /UNVERIFIED != UNSUPPORTED/);
});

test('32. no version-specific or platform-specific policy branches in hcl.ts', () => {
  const src = readFileSync(join(DIR, 'hcl.ts'), 'utf8');
  assert.ok(!/\b2\.1\.28\d\b/.test(src), 'no version literal in HCL');
  assert.ok(!/version\s*===\s*['"]/.test(src) && !/version\s*>=?\s*['"]/.test(src), 'no version comparison branch');
  assert.ok(!/platform\s*===\s*['"](win32|darwin|linux)['"]/.test(src), 'no platform policy branch');
});

test('33. output is deterministic and the sample artifact equals a fresh generation', () => {
  assert.equal(canonicalFile(sampleResult()), sampleJson());
  assert.equal(readFileSync(join(DIR, 'hcl-sample-result.json'), 'utf8'), sampleJson());
  assert.equal(sampleResult().schema, 'dkskill.host_compatibility_result/1');
  assert.equal(sampleResult().enforcement_decision, 'ENFORCEMENT_REFUSED');
});

test('34. /runtime/ is not created by M3', () => {
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.equal(existsSync(join(TEST_DIR, '..', 'runtime')), false);
});

test('identity states: IDENTIFIED / PARTIALLY_IDENTIFIED / UNIDENTIFIED', () => {
  assert.equal(staticIdentityProbe(ID283 as any).identity_status, 'IDENTIFIED');
  assert.equal(staticIdentityProbe({ product: 'claude-code', version: '2.1.283', platform: 'win32' } as any).identity_status, 'PARTIALLY_IDENTIFIED');
  assert.equal(staticIdentityProbe({ platform: 'win32' } as any).identity_status, 'UNIDENTIFIED');
  assert.equal(coreSafetyFeature().optional, false);
  assert.equal(FACET_FAMILIES.length, 5);
});
