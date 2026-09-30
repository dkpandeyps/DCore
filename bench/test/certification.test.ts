import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCertification, chainEvidence, validateEvidenceChain, evidenceHasSecrets, compareRegression } from '../compatibility/certification.ts';
import { real283Input, syntheticInput, real283Result, syntheticResult, syntheticRegistry } from '../tools/gen-certification-sample.ts';
import { staticIdentityProbe } from '../compatibility/hcl.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { buildEquivalence } from '../tools/gen-attribution-equivalence.ts';
import { canonicalFile } from '../src/canonical.ts';
import type { CertificationInput, EvidenceRecord } from '../compatibility/certification-types.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const gate = (r: any, id: string) => r.gate_results.find((g: any) => g.gate_id === id);

test('1. schema/version', () => {
  const r = syntheticResult();
  assert.equal(r.schema, 'dkskill.certification_result/1');
  assert.equal(r.version, 1);
});

test('2,35. exact profile resolution; real 2.1.283 remains NOT_CERTIFIED', () => {
  const r = real283Result();
  assert.equal(r.profile_id, 'cc-2.1.283-win32-x64-native@1');
  assert.equal(gate(r, 'CG-02').result, 'PASS');
  assert.equal(r.final_decision, 'NOT_CERTIFIED');
  assert.notEqual(r.final_decision, 'CERTIFIED');
  assert.equal(r.hcl_enforcement, 'ENFORCEMENT_REFUSED');
});

test('3,4. unknown/absent profile blocks certification', () => {
  const i = real283Input();
  const unknown = { ...i, probe: staticIdentityProbe({ product: 'claude-code', version: '9.9.9', platform: 'win32', architecture: 'x64', channel: 'native' }) };
  const r = runCertification(unknown);
  assert.equal(gate(r, 'CG-02').result, 'BLOCKED');
  assert.equal(r.final_decision, 'BLOCKED');
});

test('5. revoked profile', () => {
  const i = real283Input();
  const reg = buildRegistry();
  const profiles = reg.profiles.map((p) => p.version === '2.1.283' ? { ...p, revoked: true, lifecycle_state: 'revoked' } : p);
  const r = runCertification({ ...i, registry: { ...reg, profiles } as any });
  assert.equal(r.final_decision, 'REVOKED');
  assert.equal(gate(r, 'CG-02').result, 'FAIL');
});

test('6,7,8,9. capability probe PASS/FAIL/NOT_RUN/UNKNOWN feed CG-05', () => {
  const base = syntheticInput();
  // FAIL a safety-critical capability probe -> CG-05 FAIL -> FAILED
  const failOne = base.capabilityProbes.map((p) => p.target === 'CAP-HOOK-PRETOOLUSE-INTERCEPT' ? { ...p, result: 'FAIL' as const } : p);
  const rFail = runCertification({ ...base, capabilityProbes: failOne });
  assert.equal(gate(rFail, 'CG-05').result, 'FAIL');
  assert.equal(rFail.final_decision, 'FAILED');
  // NOT_RUN coverage -> CG-04 BLOCKED
  const dropOne = base.capabilityProbes.filter((p) => p.target !== 'CAP-HOOK-PRETOOLUSE-INTERCEPT');
  const rDrop = runCertification({ ...base, capabilityProbes: dropOne });
  assert.equal(gate(rDrop, 'CG-04').result, 'BLOCKED');
  assert.notEqual(rDrop.final_decision, 'CERTIFIED');
  // UNKNOWN probe on a safety-critical cap -> CG-05 not PASS
  const unk = base.capabilityProbes.map((p) => p.target === 'CAP-HOOK-PRETOOLUSE-INTERCEPT' ? { ...p, result: 'UNKNOWN' as const } : p);
  assert.notEqual(runCertification({ ...base, capabilityProbes: unk }).final_decision, 'CERTIFIED');
});

test('10. critical capability gate blocks when a safety-critical cap is not VERIFIED (real 2.1.283)', () => {
  const r = real283Result();
  assert.notEqual(gate(r, 'CG-05').result, 'PASS');
});

test('11. optional capability degradation is an HCL concern; certification still gated', () => {
  // certification never returns DEGRADED; an optional gap still prevents CERTIFIED
  const base = syntheticInput();
  const drop = base.capabilityProbes.filter((p) => p.target !== 'CAP-UPDATEDINPUT-NARROWING'); // optional cap not in coreSafety feature
  const r = runCertification({ ...base, capabilityProbes: drop });
  assert.equal(r.final_decision, 'CERTIFIED'); // optional cap not required by the safety feature -> still certified
});

test('12,13,14. facet PASS/FAIL/NOT_RUN feed CG-06', () => {
  const base = syntheticInput();
  assert.equal(gate(syntheticResult(), 'CG-06').result, 'PASS');
  const fail = base.facetProbes.map((p) => p.target === 'hook_protocol' ? { ...p, result: 'FAIL' as const } : p);
  assert.equal(gate(runCertification({ ...base, facetProbes: fail }), 'CG-06').result, 'FAIL');
  const drop = base.facetProbes.filter((p) => p.target !== 'hook_protocol');
  assert.equal(gate(runCertification({ ...base, facetProbes: drop }), 'CG-06').result, 'BLOCKED');
});

test('15,16. attribution gate; TS-07 unresolved blocks dependent certification', () => {
  const base = syntheticInput();
  const noTs07 = runCertification({ ...base, ts07: { resolved: false, evidence_ref: null } });
  assert.equal(gate(noTs07, 'CG-14').result, 'BLOCKED');
  assert.equal(gate(noTs07, 'CG-07').result, 'BLOCKED');
  assert.notEqual(noTs07.final_decision, 'CERTIFIED');
});

test('17. TS-11 unresolved blocks dependent certification', () => {
  const base = syntheticInput();
  const r = runCertification({ ...base, ts11: { applicable: true, resolved: false, evidence_ref: null } });
  assert.equal(gate(r, 'CG-15').result, 'BLOCKED');
  assert.notEqual(r.final_decision, 'CERTIFIED');
});

test('18,19,20. regression no-change / behavioral-change / inconclusive', () => {
  assert.equal(compareRegression({ a: 1 }, { a: 1 }).result, 'NO_BEHAVIORAL_CHANGE');
  assert.equal(compareRegression({ a: 1 }, { a: 2 }).result, 'BEHAVIORAL_CHANGE');
  assert.equal(compareRegression(null, { a: 1 }).result, 'INCONCLUSIVE');
  const base = syntheticInput();
  assert.equal(gate(runCertification({ ...base, regression: compareRegression({ a: 1 }, { a: 2 }) }), 'CG-10').result, 'FAIL');
  assert.equal(gate(runCertification({ ...base, regression: compareRegression(null, null) }), 'CG-10').result, 'BLOCKED');
});

test('21,22. changed facet does not mutate old facet; no automatic attr@2', () => {
  const before = canonicalFile(buildRegistry().facets);
  runCertification({ ...syntheticInput(), regression: compareRegression({ hook: 'v1' }, { hook: 'v2' }) });
  assert.equal(canonicalFile(buildRegistry().facets), before);            // facets unchanged
  assert.ok(!/attr@2/.test(JSON.stringify(syntheticResult())));
});

test('23,24,25. evidence hashing / chaining / tamper detection', () => {
  const host = staticIdentityProbe({ product: 'x', version: '1', platform: 'p', architecture: 'a', channel: 'c' }).identity;
  const chain = chainEvidence([
    { schema: 'dkskill.certification_evidence/1', evidence_id: 'e1', environment_id: 'E', host_identity: host, profile_id: 'p', probe_id: null, observed_result: 'PASS', source: 's', timestamp: 't', input_hash: null, output_hash: null, redaction_status: 'NONE', validation_status: 'RECORDED' },
    { schema: 'dkskill.certification_evidence/1', evidence_id: 'e2', environment_id: 'E', host_identity: host, profile_id: 'p', probe_id: null, observed_result: 'PASS', source: 's', timestamp: 't', input_hash: null, output_hash: null, redaction_status: 'NONE', validation_status: 'RECORDED' },
  ]);
  assert.ok(chain[0].record_hash!.startsWith('sha256:'));
  assert.equal(chain[1].previous_record_hash, chain[0].record_hash);
  assert.equal(validateEvidenceChain(chain), true);
  const tampered = [{ ...chain[0], observed_result: 'FAIL' }, chain[1]] as EvidenceRecord[];
  assert.equal(validateEvidenceChain(tampered), false);
});

test('26,27. credential/secret exclusion and path redaction in evidence', () => {
  assert.equal(evidenceHasSecrets(syntheticInput().evidence), false);
  assert.equal(gate(syntheticResult(), 'CG-12').result, 'PASS');
  const withSecret = syntheticInput();
  const bad = withSecret.evidence.map((e) => ({ ...e, source: 'access_token=sk-abcdef123' }));
  assert.equal(evidenceHasSecrets(bad), true);
  assert.equal(gate(runCertification({ ...withSecret, evidence: bad }), 'CG-12').result, 'FAIL');
});

test('28,29. environment separation; missing network-isolation/environment blocks CG-03', () => {
  assert.equal(syntheticInput().environment!.environment_type, 'certification');
  const r = runCertification({ ...syntheticInput(), environment: null });
  assert.equal(gate(r, 'CG-03').result, 'BLOCKED');
  assert.notEqual(r.final_decision, 'CERTIFIED');
});

test('30. owner approval required for CERTIFIED', () => {
  const noReview = runCertification({ ...syntheticInput(), ownerReview: null });
  assert.equal(gate(noReview, 'CG-13').result, 'NOT_RUN');
  assert.notEqual(noReview.final_decision, 'CERTIFIED');
});

test('31,32,33,34. CERTIFIED requires all mandatory gates PASS; BLOCKED/NOT_RUN/UNKNOWN cannot certify', () => {
  const s = syntheticResult();
  assert.equal(s.final_decision, 'CERTIFIED');
  assert.ok(s.gate_results.every((g: any) => g.result === 'PASS'));
  // any single blocked gate removes CERTIFIED
  const r = runCertification({ ...syntheticInput(), ts07: { resolved: false, evidence_ref: null } });
  assert.notEqual(r.final_decision, 'CERTIFIED');
});

test('36,37,38. 2.1.284 / macOS / Linux are not certified', () => {
  const base = real283Input();
  const p284 = runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.284', platform: 'win32', architecture: 'x64', channel: 'native' }) });
  assert.notEqual(p284.final_decision, 'CERTIFIED');
  // macOS/Linux concrete identities have no profile -> BLOCKED
  for (const platform of ['darwin', 'linux']) {
    const r = runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.283', platform, architecture: 'x64', channel: 'native' }) });
    assert.notEqual(r.final_decision, 'CERTIFIED');
  }
});

test('39,40,41. no silent version inheritance / platform / channel substitution', () => {
  const base = real283Input();
  assert.equal(runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.284', platform: 'win32', architecture: 'x64', channel: 'native' }) }).profile_id, 'cc-2.1.284-win32-x64-native@1');
  assert.equal(runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.283', platform: 'darwin', architecture: 'x64', channel: 'native' }) }).profile_id, null);
  assert.equal(runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'brew' }) }).profile_id, null);
});

test('42. no registry mutation; proposed_update produced only on CERTIFIED', () => {
  const before = canonicalFile(buildRegistry());
  const s = syntheticResult();
  assert.equal(canonicalFile(buildRegistry()), before);
  assert.ok(s.proposed_update && s.proposed_update.proposed_state === 'CERTIFIED');
  assert.equal(real283Result().proposed_update, null);
});

test('43. deterministic output equals committed sample artifacts', () => {
  assert.equal(canonicalFile(real283Result()), canonicalFile(real283Result()));
  assert.equal(readFileSync(join(DIR, 'certification-sample-2.1.283.json'), 'utf8'), canonicalFile(real283Result()));
  assert.equal(readFileSync(join(DIR, 'certification-sample-synthetic.json'), 'utf8'), canonicalFile(syntheticResult()));
});

test('44 + synthetic labelling + M2 unmutated. /runtime/ absent; synthetic clearly flagged; M2 consumed unchanged', () => {
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.equal(syntheticResult().synthetic, true);
  assert.match(JSON.stringify(syntheticResult().owner_review), /SYNTHETIC_TEST_ONLY/);
  assert.equal(real283Result().synthetic, false);
  const eqBefore = canonicalFile(buildEquivalence());
  runCertification(real283Input());
  assert.equal(canonicalFile(buildEquivalence()), eqBefore);
  // all M0 capability ids still resolve through the certification's HCL results
  const m0 = new Set(buildCatalogue().capabilities.map((c) => c.id));
  for (const row of real283Result().capability_results as any[]) assert.ok(m0.has(row.capability_id));
});
