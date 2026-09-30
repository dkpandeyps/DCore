import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TARGET_PROFILE, buildRequirements, buildOptions, classifySources, assessPath, buildGapMatrix, buildEvidencePlan,
  pathAssessmentToM9, pathAssessmentToM8, canContributeToL4, buildAuditRecord, chainAuditRecords, verifyAuditChain,
  auditRecordHash,
} from '../compatibility/network-isolation-path.ts';
import * as G from '../tools/gen-network-isolation-path-sample.ts';
import { evaluateEvidenceExecutionGate } from '../compatibility/evidence-execution.ts';
import { fixtures as execFixtures } from '../tools/gen-evidence-execution-sample.ts';
import { FROZEN_ENVIRONMENT } from '../compatibility/network-isolation.ts';
import type { IndependenceClass } from '../compatibility/network-isolation-path-types.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;

test('1. schema identifiers', () => {
  const a = f.currentReal();
  assert.equal(a.schema, 'dkskill.network_isolation_path_assessment/1');
  assert.equal(a.requirements[0].schema, 'dkskill.network_isolation_path_requirement/1');
  assert.equal(a.options[0].schema, 'dkskill.network_isolation_path_option/1');
  assert.equal(a.gap_matrix[0].schema, 'dkskill.network_isolation_path_gap/1');
  assert.equal(a.evidence_plan.schema, 'dkskill.network_isolation_path_evidence_plan/1');
  assert.equal(buildAuditRecord(a, G.FIXED()).schema, 'dkskill.network_isolation_path_audit/1');
});

test('2. requirement completeness (>=23, includes independence/enforcement/observer)', () => {
  const reqs = buildRequirements();
  assert.ok(reqs.length >= 23);
  const ids = reqs.map((r) => r.requirement_id);
  for (const id of ['REQ-04', 'REQ-08', 'REQ-10', 'REQ-19', 'REQ-20', 'REQ-21', 'REQ-22', 'REQ-23']) assert.ok(ids.includes(id), id);
});

test('3,4. current-real state + immutable real baseline', () => {
  const a = f.currentReal();
  assert.equal(a.path_status, 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER');
  assert.equal(a.current_real_network_isolation, 'UNVERIFIED');
  assert.equal(a.current_real_achieved_level, 'L0');
  assert.equal(a.current_real_independence_satisfied, false);
  assert.equal(a.synthetic_test_only, false);
});

test('5. L0 handling / self-attestation rejection', () => {
  assert.equal(f.selfReportedOnly().would_support_l4, false);
  assert.equal(f.selfReportedOnly().path_status, 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER');
});

test('6. independence classification: only independent/external can reach L4', () => {
  const classes: IndependenceClass[] = ['SELF_REPORTED', 'CONFIGURATION_OBSERVED', 'HOST_STATE_OBSERVED', 'CONTROLLED_BEHAVIOR_OBSERVED', 'SYNTHETIC_ONLY', 'INFERRED', 'UNKNOWN'];
  for (const c of classes) assert.equal(canContributeToL4(c), false, c);
  assert.equal(canContributeToL4('INDEPENDENT_OBSERVER'), true);
  assert.equal(canContributeToL4('EXTERNAL_CONTROL_PLANE'), true);
});

test('7,8,9. configuration-only / host-observation / controlled-behavior cannot be L4', () => {
  assert.equal(f.configurationOnly().would_support_l4, false);
  assert.equal(f.hostObservedOnly().would_support_l4, false);
  assert.equal(f.controlledBehaviorOnly().would_support_l4, false);
  assert.equal(f.controlledBehaviorOnly().path_status, 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER');
});

test('10. independent-observer semantics: feasible-with-prerequisites (never VERIFIED)', () => {
  const a = f.independentObserverPresent();
  assert.equal(a.path_status, 'FEASIBLE_WITH_PREREQUISITES');
  assert.equal(a.would_support_l4, true);
  assert.equal(a.supportable_level, 'L4');
  assert.equal(a.current_real_network_isolation, 'UNVERIFIED');   // still never verifies the real env
});

test('11. externally-enforced boundary feasible with prerequisites', () => {
  assert.equal(f.externallyEnforcedBoundary().path_status, 'FEASIBLE_WITH_PREREQUISITES');
});

test('12. observer present but enforcement missing => requires config change', () => {
  assert.equal(f.observerPresentEnforcementMissing().path_status, 'BLOCKED_BY_REQUIRED_CONFIGURATION_CHANGE');
  assert.equal(f.observerPresentEnforcementMissing().would_support_l4, false);
});

test('13. contradiction handling fails closed', () => {
  const a = f.contradictoryEvidence();
  assert.equal(a.path_status, 'UNVERIFIED');
  assert.ok(a.contradictions.length > 0);
  assert.equal(a.would_support_l4, false);
});

test('14,15,16. stale / expired / revoked cannot support L4', () => {
  for (const k of ['staleEvidence', 'expiredEvidence', 'revokedEvidence'] as const) {
    assert.equal(f[k]().would_support_l4, false, k);
    assert.notEqual(f[k]().path_status, 'FEASIBLE_WITH_PREREQUISITES', k);
  }
});

test('17,18. environment / profile mismatch => BLOCKED_BY_ENVIRONMENT', () => {
  assert.equal(f.environmentMismatch().path_status, 'BLOCKED_BY_ENVIRONMENT');
  assert.equal(f.profileMismatch().path_status, 'BLOCKED_BY_ENVIRONMENT');
});

test('19. tampered evidence => UNKNOWN (fail-closed)', () => {
  assert.equal(f.tamperedEvidence().path_status, 'UNKNOWN');
  assert.equal(f.tamperedEvidence().would_support_l4, false);
});

test('20. synthetic-only labeling; synthetic L4 never verifies real env', () => {
  const a = f.syntheticL4Mechanics();
  assert.equal(a.synthetic_test_only, true);
  assert.equal(a.path_status, 'FEASIBLE_WITH_PREREQUISITES');
  assert.equal(a.current_real_network_isolation, 'UNVERIFIED');
  assert.equal(a.current_real_achieved_level, 'L0');
});

test('21. future authorization requirement recorded (REQUIRES_SEPARATE_AUTHORIZATION)', () => {
  const a = f.currentReal();
  assert.ok(a.future_authorizations_required.length > 0);
  assert.ok(a.future_authorizations_required.every((s) => s.includes('REQUIRES_SEPARATE_AUTHORIZATION')));
  assert.ok(a.options.every((o) => o.authorization === 'REQUIRES_SEPARATE_AUTHORIZATION'));
  assert.equal(a.evidence_plan.requires_new_owner_authorization, true);
});

test('22,23. M9 + M8 adapters are fail-closed (never VERIFIED)', () => {
  for (const k of Object.keys(f) as (keyof typeof f)[]) {
    assert.equal(pathAssessmentToM9(f[k]()), 'UNVERIFIED', k);
    assert.equal(pathAssessmentToM8(f[k]()), 'UNVERIFIED', k);
  }
});

test('24. M8 fail-closed compatibility: unmodified M8 stays BLOCKED', () => {
  const gate = pathAssessmentToM8(f.syntheticL4Mechanics());   // even the synthetic L4 path
  const req = { ...execFixtures.currentReal(), network: { ...execFixtures.currentReal().network, isolation_status: gate } };
  const m8 = evaluateEvidenceExecutionGate(req);
  assert.equal(m8.decision, 'EXECUTION_BLOCKED');
  assert.ok(m8.stop_codes.includes('STOP-NETWORK-UNVERIFIED'));
});

test('25. gap matrix is deterministic and marks can_m11_close=false', () => {
  const a = f.currentReal();
  assert.ok(a.gap_matrix.length >= 6);
  assert.ok(a.gap_matrix.every((g) => g.can_m11_close === false));
  assert.ok(a.gap_matrix.some((g) => g.requirement_id === 'REQ-08' && g.blocking));   // missing observer blocks
  assert.ok(a.gap_matrix.some((g) => g.requirement_id === 'REQ-21'));                  // outbound connectivity / denied-test
});

test('26. path options assessed with independence + prerequisites', () => {
  const opts = buildOptions();
  assert.ok(opts.length >= 6);
  assert.ok(opts.every((o) => Array.isArray(o.prerequisites) && o.prerequisites.length > 0));
  assert.ok(opts.some((o) => o.observer_independent === true && o.m9_level_supported === 'L4'));
  assert.ok(opts.some((o) => o.observer_independent === false));   // e.g. sandbox without independent observer
});

test('27. audit chain + tamper detection', () => {
  const chain = chainAuditRecords([
    { schema: 'dkskill.network_isolation_path_audit/1', version: 1, audit_id: 'a1', assessment_id: 'x1', environment_id: FROZEN_ENVIRONMENT, m9_state: 'UNVERIFIED', m8_state: 'BLOCKED', requirements_assessed: 23, options_assessed: 6, evidence_classes: [], gaps: 8, path_status: 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER', artifact_hashes: [], timestamp: G.FIXED() },
    { schema: 'dkskill.network_isolation_path_audit/1', version: 1, audit_id: 'a2', assessment_id: 'x2', environment_id: FROZEN_ENVIRONMENT, m9_state: 'UNVERIFIED', m8_state: 'BLOCKED', requirements_assessed: 23, options_assessed: 6, evidence_classes: [], gaps: 8, path_status: 'UNVERIFIED', artifact_hashes: [], timestamp: G.FIXED() },
  ] as any);
  assert.equal(verifyAuditChain(chain), true);
  assert.equal(verifyAuditChain([{ ...chain[0], path_status: 'FEASIBLE_WITH_PREREQUISITES' as const }, chain[1]]), false);
  const t = G.tamperedAuditDemo();
  assert.notEqual(auditRecordHash({ ...t, record_hash: undefined } as any), t.record_hash);
});

test('28. static safety: no network/shell/mutation in M11 module', () => {
  const mod = readFileSync(join(DIR, 'network-isolation-path.ts'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|net\.connect|http\.request|https\.request|child_process|execSync|nslookup|Invoke-WebRequest/.test(mod));
  assert.ok(!/Set-Net|New-NetFirewallRule|netsh\s+advfirewall\s+set|route\s+(add|delete)/.test(mod));
});

test('29. evidence plan is hypothetical + requires new authorization', () => {
  const plan = buildEvidencePlan();
  assert.equal(plan.hypothetical, true);
  assert.equal(plan.requires_new_owner_authorization, true);
  assert.ok(plan.independent_observer.toLowerCase().includes('not the enforcer') || plan.independent_observer.toLowerCase().includes('not the host'));
  assert.ok(plan.m9_validation.includes('never weakened') || plan.m9_validation.includes('runVerification'));
});

test('30. deterministic output; committed == fresh; /runtime absent; no secrets', () => {
  assert.equal(canonicalFile(f.currentReal()), canonicalFile(f.currentReal()));
  assert.equal(canonicalFile(f.syntheticL4Mechanics()), canonicalFile(f.syntheticL4Mechanics()));
  const files: [string, unknown][] = [
    ['nip-sample-current-real.json', f.currentReal()],
    ['nip-sample-configuration-only.json', f.configurationOnly()],
    ['nip-sample-independent-observer-present.json', f.independentObserverPresent()],
    ['nip-sample-contradictory.json', f.contradictoryEvidence()],
    ['nip-sample-environment-mismatch.json', f.environmentMismatch()],
    ['nip-sample-synthetic-l4-mechanics.json', f.syntheticL4Mechanics()],
  ];
  for (const [name, obj] of files) assert.equal(readFileSync(join(DIR, name), 'utf8'), canonicalFile(obj), name);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6})/i.test(JSON.stringify(f.syntheticL4Mechanics())));
});

test('31. classifySources notes explain why non-independent cannot reach L4', () => {
  const findings = classifySources([{ source_id: 'h', description: 'x', independence_class: 'HOST_STATE_OBSERVED', signal: 'ISOLATION_SUPPORTING', observed_at: G.FIXED(), expires_at: null, max_age_ms: null, revoked: false, applicable: true, enforcement_demonstrated: true }], G.FIXED());
  assert.equal(findings[0].can_contribute_to_l4, false);
  assert.ok(findings[0].note.toLowerCase().includes('never contribute to l4'));
});

test('32. no production certification/publication surface; evidence classes recorded; buildGapMatrix pure', () => {
  const a = f.currentReal();
  // M11 exposes no certify/publish/registry-mutation entry point
  const mod = readFileSync(join(DIR, 'network-isolation-path.ts'), 'utf8');
  assert.ok(!/certify|publish|mutateRegistry|writeFileSync|createRuntime/.test(mod));
  assert.ok(Array.isArray(a.evidence_classes_assessed));
  const g1 = buildGapMatrix(buildRequirements(), { environment_matches: true, profile_matches: true, usableIndependent: false, independentClassPresent: false, outbound: true, deny: false });
  const g2 = buildGapMatrix(buildRequirements(), { environment_matches: true, profile_matches: true, usableIndependent: false, independentClassPresent: false, outbound: true, deny: false });
  assert.equal(canonicalFile(g1), canonicalFile(g2));
  assert.equal(TARGET_PROFILE, 'cc-2.1.283-win32-x64-native@1');
});
