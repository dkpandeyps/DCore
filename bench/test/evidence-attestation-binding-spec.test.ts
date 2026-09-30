import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildBindingSpec, validateSpecConsistency, verifySpec, specHasSecret } from '../compatibility/evidence-attestation-binding-spec.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const spec = buildBindingSpec();
const M19_STATES = ['INCOMPLETE', 'COMPLETE_UNSIGNED', 'CONTRADICTED', 'AMBIGUOUS', 'EXPIRED', 'REVOKED', 'SUPERSEDED', 'TAMPERED'];

test('1. schema + design_only + deterministic + verifiable + consistent', () => {
  assert.equal(spec.schema, 'dkskill.evidence_attestation_binding_spec/1');
  assert.equal(spec.design_only, true);
  assert.equal(canonicalFile(buildBindingSpec()), canonicalFile(buildBindingSpec()));
  assert.equal(verifySpec(spec), true);
  assert.equal(validateSpecConsistency(spec).ok, true);
});

test('2. field map: all 8 fields; required set correct; channel/binary >= CONTROLLED', () => {
  assert.equal(spec.field_map.length, 8);
  const req = spec.field_map.filter((f) => f.required_for_completeness).map((f) => f.field).sort();
  assert.deepEqual(req, ['architecture', 'binary_sha256', 'channel', 'operating_system', 'product', 'version'].sort());
  assert.equal(spec.field_map.find((f) => f.field === 'channel')!.min_provenance, 'CONTROLLED_OBSERVATION');
  assert.equal(spec.field_map.find((f) => f.field === 'binary_sha256')!.min_provenance, 'CONTROLLED_OBSERVATION');
  assert.equal(spec.field_map.find((f) => f.field === 'os_version')!.may_remain_unknown, true);
});

test('3. channel + binary require L4 + independent observation', () => {
  for (const f of ['channel', 'binary_sha256']) {
    const b = spec.field_map.find((x) => x.field === f)!;
    assert.equal(b.l4_required, true, f);
    assert.equal(b.independent_observation_required, true, f);
  }
});

test('4. provenance rules: conflicting values contradict regardless of strength; no silent downgrade', () => {
  assert.ok(/divergent value contradicts REGARDLESS of strength/i.test(spec.provenance_rules.conflicting_values));
  assert.ok(/NEVER decreases/i.test(spec.provenance_rules.downgrade));
  assert.ok(/same environment_id/i.test(spec.provenance_rules.reuse_across_attempts));
});

test('5. binary contract: authoritative/supporting/insufficient + open gap preserved', () => {
  assert.ok(spec.binary_binding.insufficient.includes('filename') && spec.binary_binding.insufficient.includes('package.json version'));
  assert.ok(spec.binary_binding.authoritative.some((s) => /exact executable SHA-256/i.test(s)));
  assert.ok(/OPEN DESIGN GAP/i.test(spec.binary_binding.open_gap));
});

test('6. channel contract: candidates as design-only; forbidden inference; open gap preserved', () => {
  assert.ok(spec.channel_binding.design_candidates.length >= 2);
  for (const bad of ['version', 'filename', 'path', 'OS', 'architecture', 'benchmark pin', 'registry profile']) assert.ok(spec.channel_binding.forbidden_inference.includes(bad), bad);
  assert.ok(/OPEN DESIGN GAP/i.test(spec.channel_binding.open_gap));
});

test('7. L4 relationship: current env stays L0/UNVERIFIED, M8 blocked; absent/stale/revoked block', () => {
  assert.ok(/L0\/UNVERIFIED/i.test(spec.l4_relationship.current_real_env));
  assert.ok(/EXECUTION_BLOCKED/i.test(spec.l4_relationship.current_real_env));
  assert.ok(/BLOCKED/i.test(spec.l4_relationship.absent) && /BLOCKED/i.test(spec.l4_relationship.stale) && /BLOCKED/i.test(spec.l4_relationship.revoked));
});

test('8. contradiction rules use only M19 states; env-mismatch=INCOMPLETE; install=AMBIGUOUS', () => {
  assert.ok(spec.contradiction_rules.every((c) => M19_STATES.includes(c.result)));
  assert.equal(spec.contradiction_rules.find((c) => /environment mismatch/i.test(c.contradiction))!.result, 'INCOMPLETE');
  assert.equal(spec.contradiction_rules.find((c) => /installation mismatch/i.test(c.contradiction))!.result, 'AMBIGUOUS');
});

test('9. M4 gate: COMPLETE_UNSIGNED != CERTIFIED; requires exact cell + L4 + owner auth', () => {
  assert.equal(spec.m4_consumption_gate.complete_unsigned_is_not_certified, true);
  const req = spec.m4_consumption_gate.requires.join(' | ');
  assert.ok(/exact M13 matrix-cell/i.test(req) && /M9-L4/i.test(req) && /owner authorization/i.test(req));
  assert.ok(spec.m4_consumption_gate.transition[0] === 'COMPLETE_UNSIGNED' && spec.m4_consumption_gate.transition.includes('immutable registry publication'));
});

test('10. failure matrix: >=21 rows; only M19 states; never PASS; never certifies', () => {
  assert.ok(spec.m4_failure_matrix.length >= 21);
  assert.ok(spec.m4_failure_matrix.every((r) => M19_STATES.includes(r.attestation_state)));
  assert.ok(spec.m4_failure_matrix.every((r) => r.m4_gate_result !== 'PASS'));
  assert.ok(spec.m4_failure_matrix.every((r) => r.certification_consequence !== ('CERTIFIED' as any)));
  // L4 rows: attestation can be COMPLETE_UNSIGNED but M4 BLOCKED
  const l4 = spec.m4_failure_matrix.find((r) => r.case_id === 'F-15')!;
  assert.equal(l4.attestation_state, 'COMPLETE_UNSIGNED');
  assert.equal(l4.m4_gate_result, 'BLOCKED');
});

test('11. hash-binding: sha256 only, content-addressed, 5-level chain, tamper failure modes', () => {
  assert.equal(spec.hash_binding_model.algorithm, 'sha256');
  assert.equal(spec.hash_binding_model.content_addressed, true);
  assert.equal(spec.hash_binding_model.chain.length, 5);
  assert.ok(spec.hash_binding_model.failure_modes.some((m) => /substitution/i.test(m)));
});

test('12. multiple-installation: exact ref, no PATH/default/silent selection', () => {
  assert.ok(/no PATH guessing/i.test(spec.multiple_installation_model.forbidden));
  assert.ok(/AMBIGUOUS/i.test(spec.multiple_installation_model.ambiguity));
});

test('13. observer trust boundary: independent required for channel/binary authoritative; M20 signs nothing', () => {
  const indep = spec.observer_trust_boundary.find((o) => /independent observer/i.test(o.class))!;
  assert.ok(indep.sufficient_for.some((s) => /channel/i.test(s)) && indep.sufficient_for.some((s) => /binary/i.test(s)));
  assert.ok(spec.public_private_boundary.signing_governance.some((s) => /does not sign/i.test(s)));
});

test('14. security review: 14 threats, all block certification', () => {
  assert.ok(spec.security_review.length >= 14);
  assert.ok(spec.security_review.every((t) => t.certification_blocked === true && !!t.required_control && !!t.failure_state));
  for (const a of ['evidence substitution', 'evidence replay', 'observer compromise', 'forged provenance']) assert.ok(spec.security_review.some((t) => t.attack === a), a);
});

test('15. fixtures (18, SYNTHETIC_TEST_ONLY); test specs (15); open gaps (4) preserved', () => {
  assert.equal(spec.fixture_specs.length, 18);
  assert.ok(spec.fixture_specs.every((f) => f.label === 'SYNTHETIC_TEST_ONLY'));
  assert.ok(spec.future_test_specs.length >= 15);
  assert.equal(spec.open_design_gaps.length, 4);
  assert.ok(spec.open_design_gaps.every((g) => g.status === 'OPEN_DESIGN_GAP'));
});

test('16. no secrets; committed == fresh; production immutable; /runtime absent; static safety', () => {
  assert.equal(specHasSecret(spec), false);
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'evidence-attestation-binding-spec.json'), 'utf8'), canonicalFile(buildBindingSpec()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  const mod = readFileSync(join(DIR, 'evidence-attestation-binding-spec.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|child_process|execSync|execFileSync|\bspawn\s*\(|writeFileSync|sign\s*\(|generateKey/i.test(mod));
});
