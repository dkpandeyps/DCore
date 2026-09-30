import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildGovernanceSpec, validateGovernanceSpec, verifySpec, specHasSecret, MAIN_STATES, READINESS_COMPONENTS,
} from '../compatibility/certification-governance-state-machine-spec.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const spec = buildGovernanceSpec();

test('1. schema + design_only + deterministic + verifiable + consistent', () => {
  assert.equal(spec.schema, 'dkskill.certification_governance_state_machine_spec/1');
  assert.equal(spec.design_only, true);
  assert.equal(canonicalFile(buildGovernanceSpec()), canonicalFile(buildGovernanceSpec()));
  assert.equal(verifySpec(spec), true);
  assert.equal(validateGovernanceSpec(spec).ok, true);
});

test('2. state machine: 11 main states in order; terminal states present', () => {
  assert.deepEqual(spec.state_machine.map((s) => s.state), [...MAIN_STATES]);
  assert.ok(spec.terminal_states.includes('NOT_CERTIFIED') && spec.terminal_states.includes('CONTRADICTED') && spec.terminal_states.includes('ROLLED_BACK'));
});

test('3. registry mutation ONLY at PUBLICATION; certification not before CERTIFICATION_DECISION', () => {
  const mut = spec.state_machine.filter((s) => s.registry_mutation_possible).map((s) => s.state);
  assert.deepEqual(mut, ['PUBLICATION']);
  for (const s of ['IDENTITY_EVIDENCE', 'ATTESTATION_INCOMPLETE', 'ATTESTATION_COMPLETE_UNSIGNED', 'M4_EVALUATION']) assert.equal(spec.state_machine.find((x) => x.state === s)!.certification_exists, false, s);
  assert.equal(spec.state_machine.find((s) => s.state === 'M13_CELL_CERTIFIED')!.certification_exists, true);
});

test('4. precondition table: 23 rows with PASS/FAIL/BLOCKED/resulting_state', () => {
  assert.equal(spec.precondition_table.length, 23);
  assert.ok(spec.precondition_table.every((r) => r.pass && r.resulting_state && typeof r.fresh_evidence_required === 'boolean'));
  assert.ok(spec.precondition_table.some((r) => /M9 L4/i.test(r.precondition)) && spec.precondition_table.some((r) => /channel binding/i.test(r.precondition)));
});

test('5. COMPLETE_UNSIGNED gate: != CERTIFIED; authorizes only M4 evaluation', () => {
  assert.equal(spec.complete_unsigned_gate.complete_unsigned_is_not_certified, true);
  assert.deepEqual(spec.complete_unsigned_gate.authorizes, ['M4 evaluation only']);
});

test('6. M4 gate requires TS-07/TS-11 + L4 + owner auth; no real certification', () => {
  const req = spec.m4_gate.requires.join(' | ');
  assert.ok(/TS-07 resolved/i.test(req) && /TS-11 resolved/i.test(req) && /M9 L4 verified/i.test(req) && /owner authorization/i.test(req));
  assert.equal(spec.m4_gate.no_real_certification, true);
});

test('7. M5/M6/signature/registry boundaries', () => {
  assert.ok(spec.m5_gate.fail_on.includes('changed cell') && spec.m5_gate.fail_on.includes('stale certification'));
  assert.equal(spec.m6_gate.no_signing, true);
  assert.equal(spec.signature_boundary.algorithm_status, 'OPEN_OWNER_DECISION');
  assert.equal(spec.registry_mutation_boundary.otherwise, 'NO_REGISTRY_MUTATION');
  assert.equal(spec.registry_mutation_boundary.only_after.length, 7);
});

test('8. M13 exact-cell rule: no inheritance/substitution; same cell every object', () => {
  assert.equal(spec.m13_cell_rule.every_object_same_cell, true);
  for (const bad of ['inheritance', 'latest substitution', 'platform substitution', 'version substitution']) assert.ok(spec.m13_cell_rule.no.includes(bad), bad);
});

test('9. GAP-01 & GAP-02 preserved OPEN; not solved by inference', () => {
  const g1 = spec.gap_assessments.find((g) => g.id === 'GAP-01')!;
  assert.equal(g1.status, 'OPEN_DESIGN_GAP');
  assert.ok(/no proven safe autonomous local channel source/i.test(g1.authoritative_finding));
  assert.ok(g1.candidates.some((c) => c.classification === 'REJECTED') && g1.candidates.some((c) => c.classification === 'UNPROVEN'));
  const g2 = spec.gap_assessments.find((g) => g.id === 'GAP-02')!;
  assert.equal(g2.status, 'OPEN_DESIGN_GAP');
  assert.ok(g2.candidates.some((c) => c.candidate === 'exact executable byte hash' && c.classification === 'AUTHORITATIVE'));
  assert.ok(g2.candidates.some((c) => c.candidate === 'filename/path' && c.classification === 'INSUFFICIENT'));
});

test('10. GAP-04R algo/root/store/recovery are OPEN OWNER DECISION; no choice made', () => {
  for (const id of ['GAP-04R-ALGO', 'GAP-04R-ROOT', 'GAP-04R-STORE', 'GAP-04R-RECOVERY']) {
    const g = spec.gap_assessments.find((x) => x.id === id)!;
    assert.equal(g.status, 'OPEN_OWNER_DECISION', id);
  }
  assert.equal(spec.gap_assessments.find((g) => g.id === 'GAP-04R-ALGO')!.candidates.length, 0);   // no algorithm chosen
});

test('11. readiness vector: all NOT_READY/BLOCKED; overall NOT_READY', () => {
  assert.deepEqual(spec.readiness_vector.map((r) => r.component), [...READINESS_COMPONENTS]);
  assert.ok(spec.readiness_vector.every((r) => r.status === 'NOT_READY' || r.status === 'BLOCKED'));
  assert.equal(spec.readiness_vector.find((r) => r.component === 'M9_L4_READY')!.status, 'BLOCKED');
  assert.equal(spec.overall_readiness, 'NOT_READY');
});

test('12. universal platform readiness: per-cell, no inference, certified 0', () => {
  assert.equal(spec.universal_platform_readiness.no_inference, true);
  assert.equal(spec.universal_platform_readiness.certified_count, 0);
  assert.ok(/independently certified/i.test(spec.universal_platform_readiness.per_cell));
});

test('13. owner decision register: OD-01..OD-10, all OPEN, no auto-decision', () => {
  assert.equal(spec.owner_decision_register.length, 10);
  assert.ok(spec.owner_decision_register.every((d) => d.current_status === 'OPEN_OWNER_DECISION' && /no inference/i.test(d.prohibited_inference)));
  assert.ok(spec.owner_decision_register.some((d) => d.id === 'OD-10' && /activation/i.test(d.decision_required)));
});

test('14. activation prerequisites: none met; activation_all_met false; includes TS-07/TS-11/GAPs', () => {
  assert.equal(spec.activation_all_met, false);
  assert.ok(spec.certification_activation_prerequisites.every((p) => p.met === false));
  const reqs = spec.certification_activation_prerequisites.map((p) => p.requirement).join(' | ');
  assert.ok(/GAP-01 closed/i.test(reqs) && /TS-07 resolved/i.test(reqs) && /M9 L4 independently VERIFIED/i.test(reqs) && /signing governance READY/i.test(reqs));
});

test('15. first-certification safety boundary: no bootstrap/inheritance/bypass; independently evidenced', () => {
  const b = spec.first_certification_safety_boundary.join(' | ');
  for (const s of ['no bootstrap from synthetic certification', 'no version inheritance', 'no M9 bypass', 'no M8 bypass', 'no weak identity inference']) assert.ok(b.includes(s), s);
  assert.ok(/first production-certified cell must be independently evidenced/i.test(b));
});

test('16. failure/recovery matrix: 24 conditions; history intact; fail-closed', () => {
  assert.equal(spec.failure_recovery_matrix.length, 24);
  assert.ok(spec.failure_recovery_matrix.every((r) => r.history_intact === true && !!r.state && !!r.block_point));
  assert.ok(spec.failure_recovery_matrix.some((r) => /TS-07 unresolved/i.test(r.condition)) && spec.failure_recovery_matrix.some((r) => /revocation/i.test(r.condition)));
});

test('17. synthetic e2e fixture: positive + negatives, all SYNTHETIC_TEST_ONLY, never certified', () => {
  assert.equal(spec.synthetic_e2e_fixture.positive.label, 'SYNTHETIC_TEST_ONLY');
  assert.ok(/never certified\/published/i.test(spec.synthetic_e2e_fixture.positive.expected));
  assert.ok(spec.synthetic_e2e_fixture.negatives.length >= 12);
  assert.ok(spec.synthetic_e2e_fixture.negatives.every((n) => n.label === 'SYNTHETIC_TEST_ONLY' && /fail-closed/i.test(n.expected)));
});

test('18. security review: 17 threats, all block certification; includes synthetic-to-production escalation', () => {
  assert.ok(spec.security_review.length >= 17);
  assert.ok(spec.security_review.every((t) => t.certification_blocked === true));
  for (const a of ['confused deputy', 'cell substitution', 'cross-platform inheritance', 'synthetic-to-production escalation']) assert.ok(spec.security_review.some((t) => t.threat === a), a);
});

test('19. no secrets; committed == fresh; production immutable; /runtime absent; static safety', () => {
  assert.equal(specHasSecret(spec), false);
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'certification-governance-state-machine-spec.json'), 'utf8'), canonicalFile(buildGovernanceSpec()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  const mod = readFileSync(join(DIR, 'certification-governance-state-machine-spec.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|child_process|execSync|execFileSync|\bspawn\s*\(|writeFileSync|createSign\s*\(|generateKeyPair/i.test(mod));
});
