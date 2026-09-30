import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildOwnerDecisionDossier, validateDossier, verifyDossier, dossierHasSecret, recomputeReadiness, currentInputs,
  fullySatisfiedInputs, evaluateFirstCertificationTree, OD_IDS, GAP_IDS,
} from '../compatibility/owner-decision-dossier.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const d = buildOwnerDecisionDossier();

test('1. schema + design_only + deterministic + verifiable + consistent; no decisions made', () => {
  assert.equal(d.schema, 'dkskill.owner_decision_dossier/1');
  assert.equal(d.design_only, true);
  assert.equal(d.decisions_made, 0);
  assert.equal(canonicalFile(buildOwnerDecisionDossier()), canonicalFile(buildOwnerDecisionDossier()));
  assert.equal(verifyDossier(d), true);
  assert.equal(validateDossier(d).ok, true);
});

test('2. master decision register: OD-01..OD-10, all OPEN, safe default OPEN/NOT_READY', () => {
  assert.deepEqual(d.master_decision_register.map((x) => x.decision_id), [...OD_IDS]);
  assert.ok(d.master_decision_register.every((x) => x.current_status === 'OPEN' && /OPEN/i.test(x.safe_default) && /no inference/i.test(x.prohibited_inference)));
});

test('3. gap register: 7 gaps all OPEN; none closed without evidence', () => {
  assert.deepEqual(d.gap_register.map((g) => g.gap_id), [...GAP_IDS]);
  assert.ok(d.gap_register.every((g) => g.status === 'OPEN' && g.requires_owner_authorization === true));
  assert.ok(d.gap_register.find((g) => g.gap_id === 'GAP-01')!.requires_real_world_evidence);
});

test('4. OD-01 channel dossier preserves M18 (no inference)', () => {
  const od1 = d.master_decision_register.find((x) => x.decision_id === 'OD-01')!;
  assert.ok(/without inference/i.test(od1.question));
  assert.ok(od1.readiness_dimensions_affected.includes('CHANNEL_READY'));
});

test('5. OD-02 binary dossier: exact byte hash is the acceptable source', () => {
  const od2 = d.master_decision_register.find((x) => x.decision_id === 'OD-02')!;
  assert.ok(od2.acceptable_evidence_sources.some((s) => /byte hash/i.test(s)));
});

test('6. OD-03..OD-06 remain OPEN (no algorithm/root/store/recovery chosen)', () => {
  for (const id of ['OD-03', 'OD-04', 'OD-05', 'OD-06']) {
    const od = d.master_decision_register.find((x) => x.decision_id === id)!;
    assert.equal(od.current_status, 'OPEN', id);
    assert.ok(od.options.includes('remain OPEN'), id);
  }
});

test('7. readiness recomputation: current => NOT_READY; never certified', () => {
  const r = recomputeReadiness(currentInputs());
  assert.equal(r.overall, 'NOT_READY');
  assert.equal(r.certified, false);
  assert.equal(r.dimensions.M9_L4_READY, 'BLOCKED');
  assert.equal(r.dimensions.IDENTITY_READY, 'NOT_READY');
});

test('8. dependency propagation: OD-01 open => CHANNEL/IDENTITY NOT_READY even if all else satisfied', () => {
  const i = { ...fullySatisfiedInputs(), decisions: { ...fullySatisfiedInputs().decisions, 'OD-01': 'OPEN' as const }, gaps: { ...fullySatisfiedInputs().gaps, 'GAP-01': 'OPEN' as const } };
  const r = recomputeReadiness(i);
  assert.equal(r.dimensions.CHANNEL_READY, 'NOT_READY');
  assert.equal(r.dimensions.IDENTITY_READY, 'NOT_READY');
  assert.equal(r.overall, 'NOT_READY');
});

test('9. fully-satisfied SYNTHETIC input => READY (design fn), but this is not real certification', () => {
  const r = recomputeReadiness(fullySatisfiedInputs());
  assert.equal(r.overall, 'READY');
  assert.equal(r.conceptually_eligible, true);
  assert.equal(r.certified, false);   // readiness is never certification
});

test('10. decision fixtures (10, SYNTHETIC_TEST_ONLY) match their expected recomputation', () => {
  assert.equal(d.decision_fixtures.length, 10);
  assert.ok(d.decision_fixtures.every((f) => f.label === 'SYNTHETIC_TEST_ONLY'));
  for (const f of d.decision_fixtures) assert.equal(recomputeReadiness(f.inputs).overall, f.expected_overall, f.id);
  assert.equal(d.decision_fixtures.find((f) => f.id === 'DF-10')!.expected_overall, 'READY');
  assert.equal(d.decision_fixtures.find((f) => f.id === 'DF-05')!.expected_overall, 'NOT_READY');   // except M9
});

test('11. first-certification decision tree: current stops early; synthetic-full eligible', () => {
  assert.equal(evaluateFirstCertificationTree(currentInputs()).result, 'NOT_READY');
  const full = evaluateFirstCertificationTree(fullySatisfiedInputs());
  assert.equal(full.result, 'CONCEPTUALLY_ELIGIBLE_FOR_AUTHORIZED_PUBLICATION');
  assert.ok(/no real certification/i.test(full.stopped_at));
  // remove M9 => BLOCKED at that node
  assert.equal(evaluateFirstCertificationTree({ ...fullySatisfiedInputs(), m9_l4: 'UNVERIFIED' }).result, 'BLOCKED');
});

test('12. activation checklist: 15 items all met=false; activation_all_met false', () => {
  assert.equal(d.activation_all_met, false);
  assert.equal(d.activation_checklist.length, 15);
  assert.ok(d.activation_checklist.every((c) => c.met === false));
});

test('13. scenario table: 30 rows (10 ODs x 3 outcomes); ACCEPTED needs new evidence + re-review', () => {
  assert.equal(d.scenario_table.length, 30);
  assert.ok(d.scenario_table.every((r) => r.re_review_required === true));
  assert.ok(d.scenario_table.filter((r) => r.outcome === 'ACCEPTED').every((r) => r.new_evidence_required === true));
});

test('14. evidence requests + review packet complete', () => {
  assert.ok(d.evidence_requests.length >= 7);
  assert.ok(d.evidence_requests.every((e) => e.expected_result && e.failure_result && e.required_provenance));
  assert.equal(d.review_packet.length, 10);
  assert.ok(d.review_packet.every((p) => /OPEN/i.test(p.safe_default) && p.owner_action_required));
});

test('15. platform impact: per-cell, no cross-platform inference', () => {
  assert.ok(d.platform_impact.every((p) => p.no_cross_platform_inference === true));
  assert.ok(d.platform_impact.every((p) => /Windows cell only/i.test(p.windows)));
});

test('16. security review: unresolved stays certification_blocked; accidental activation covered', () => {
  assert.ok(d.security_review.every((t) => t.unresolved_remains === 'certification_blocked=true'));
  for (const a of ['inferred evidence', 'synthetic-to-production escalation', 'accidental activation', 'unauthorized approval']) assert.ok(d.security_review.some((t) => t.threat === a), a);
});

test('17. safe default + open gaps preserved; no secrets; committed == fresh; production immutable; /runtime absent', () => {
  assert.equal(d.safe_default, 'OPEN / NOT_READY / NO_CERTIFICATION / NO_PUBLICATION');
  assert.ok(d.open_gaps.every((g) => g.status === 'OPEN'));
  assert.equal(dossierHasSecret(d), false);
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'owner-decision-dossier.json'), 'utf8'), canonicalFile(buildOwnerDecisionDossier()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('18. static: dossier module has no execution/network/signing/key-gen primitives', () => {
  const mod = readFileSync(join(DIR, 'owner-decision-dossier.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|child_process|execSync|execFileSync|\bspawn\s*\(|writeFileSync|createSign\s*\(|generateKeyPair|crypto\.sign\s*\(/i.test(mod));
});
