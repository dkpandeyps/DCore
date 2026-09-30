import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAuthorization, observerIsIndependent, runPreparation, prepToM9, prepToM8, buildAuditRecord, chainAuditRecords,
  verifyAuditChain, auditRecordHash,
} from '../compatibility/network-isolation-prep.ts';
import * as G from '../tools/gen-network-isolation-prep-sample.ts';
import { evaluateEvidenceExecutionGate } from '../compatibility/evidence-execution.ts';
import { fixtures as execFixtures } from '../tools/gen-evidence-execution-sample.ts';
import { FROZEN_ENVIRONMENT } from '../compatibility/network-isolation.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;

test('1. schema identifiers + authorization scope', () => {
  const r = f.currentReal();
  assert.equal(r.schema, 'dkskill.network_isolation_prep_result/1');
  assert.equal(r.authorization.schema, 'dkskill.network_isolation_prep_authorization/1');
  assert.equal(r.authorization.scope, 'NETWORK_ISOLATION_ENVIRONMENT_PREPARATION_ONLY');
  assert.equal(r.plan.schema, 'dkskill.network_isolation_prep_plan/1');
  assert.equal(buildAuditRecord(r, G.FIXED()).schema, 'dkskill.network_isolation_prep_audit/1');
});

test('2. authorization forbids execution/auth/ts07/ts11/runA/benchmark/cert/publish/registry', () => {
  const a = buildAuthorization(G.FIXED());
  for (const k of ['claude_execution_authorized', 'authentication_authorized', 'ts07_authorized', 'ts11_authorized', 'run_a_authorized', 'benchmark_authorized', 'certification_authorized', 'publication_authorized', 'registry_mutation_authorized'] as const)
    assert.equal(a[k], false, k);
});

test('3. current real environment => BLOCKED, no independent observer, ZERO changes applied', () => {
  const r = f.currentReal();
  assert.equal(r.final_state, 'BLOCKED');
  assert.equal(r.independent_observer_established, false);
  assert.equal(r.changes_applied.length, 0);
  assert.equal(r.network_isolation, 'UNVERIFIED');
  assert.ok(r.stop_reasons.some((s) => /independent observer/i.test(s)));
});

test('4. host self-report is rejected as an observer', () => {
  assert.equal(f.selfReportObserverRejected().final_state, 'BLOCKED');
  assert.ok(f.selfReportObserverRejected().stop_reasons.some((s) => /self.?report|same host/i.test(s)));
  // observerIsIndependent predicate
  assert.equal(observerIsIndependent({ proposed: true, identity: 'h', enforcement_identity: 'h', observation_mechanism: 'x', is_same_host_self_report: true, external: false, binds_to_environment: true, freshness_established: true, tamper_protected: true }), false);
});

test('5. genuine independent observer required (external + enforcer-distinct + bound + fresh + tamper-protected)', () => {
  const ok = { proposed: true, identity: 'ext', enforcement_identity: 'enf', observation_mechanism: 'm', is_same_host_self_report: false, external: true, binds_to_environment: true, freshness_established: true, tamper_protected: true };
  assert.equal(observerIsIndependent(ok), true);
  assert.equal(observerIsIndependent({ ...ok, external: false }), false);
  assert.equal(observerIsIndependent({ ...ok, enforcement_identity: 'ext' }), false);   // observer == enforcer
  assert.equal(observerIsIndependent({ ...ok, tamper_protected: false }), false);
});

test('6. overbroad change => BLOCKED (STOP rather than weakening)', () => {
  assert.equal(f.overbroadChangeBlocked().final_state, 'BLOCKED');
  assert.equal(f.overbroadChangeBlocked().changes_applied.length, 0);
  assert.ok(f.overbroadChangeBlocked().stop_reasons.some((s) => /overbroad/i.test(s)));
});

test('7. boundary cannot demonstrate enforced denial => BLOCKED', () => {
  assert.equal(f.cannotDemonstrateDenial().final_state, 'BLOCKED');
});

test('8. apply failure => FAILED, no changes retained as applied', () => {
  const r = f.applyFailure();
  assert.equal(r.final_state, 'FAILED');
  assert.equal(r.changes_applied.length, 0);
});

test('9. environment mismatch => BLOCKED', () => {
  assert.equal(f.environmentMismatch().final_state, 'BLOCKED');
});

test('10. synthetic prepared path => PREPARED_FOR_L4_VERIFICATION (never VERIFIED), change-control + rollback', () => {
  const r = f.observerAvailablePrepared();
  assert.equal(r.final_state, 'PREPARED_FOR_L4_VERIFICATION');
  assert.equal(r.independent_observer_established, true);
  assert.equal(r.synthetic_test_only, true);
  assert.equal(r.network_isolation, 'UNVERIFIED');                 // never verified
  assert.ok(r.changes_applied.length > 0 && r.changes_applied.every((c) => c.synthetic_only === true && c.applied === true));
  assert.equal(r.rollback_ledger.length, r.changes_applied.length);
  assert.ok(r.rollback_ledger.every((x) => !!x.rollback_operation));
});

test('11. preparation evidence is never labelled INDEPENDENT_VERIFICATION / L4', () => {
  for (const k of Object.keys(f) as (keyof typeof f)[]) {
    const r = f[k]();
    assert.notEqual(r.evidence_class_of_preparation, 'INDEPENDENT_VERIFICATION');
    assert.notEqual(r.final_state as string, 'VERIFIED');
    assert.equal(r.network_isolation, 'UNVERIFIED');
  }
});

test('12. change-control records carry operation/reason/prev/new/scope/rollback/timestamp', () => {
  const r = f.observerAvailablePrepared();
  for (const c of r.changes_applied) {
    assert.ok(c.operation && c.reason && c.previous_state && c.new_state && c.authorization_scope && c.rollback_operation && c.timestamp);
    assert.ok(c.authorization_scope.includes('M12-AUTH'));
  }
});

test('13. adapters fail-closed: prep never emits VERIFIED to M9/M8', () => {
  for (const k of Object.keys(f) as (keyof typeof f)[]) {
    assert.equal(prepToM9(f[k]()), 'UNVERIFIED', k);
    assert.equal(prepToM8(f[k]()), 'UNVERIFIED', k);
  }
});

test('14. unmodified M8 stays EXECUTION_BLOCKED even for the synthetic prepared path', () => {
  const gate = prepToM8(f.observerAvailablePrepared());
  const req = { ...execFixtures.currentReal(), network: { ...execFixtures.currentReal().network, isolation_status: gate } };
  const m8 = evaluateEvidenceExecutionGate(req);
  assert.equal(m8.decision, 'EXECUTION_BLOCKED');
  assert.ok(m8.stop_codes.includes('STOP-NETWORK-UNVERIFIED'));
});

test('15. future L4 still required is documented', () => {
  const r = f.observerAvailablePrepared();
  assert.ok(r.future_l4_still_required.length >= 3);
  assert.ok(r.future_l4_still_required.some((s) => /separate.*authorization/i.test(s)));
  assert.ok(r.future_l4_still_required.some((s) => /M9|independent.?verification/i.test(s)));
});

test('16. audit chain + tamper detection', () => {
  const chain = chainAuditRecords([
    { schema: 'dkskill.network_isolation_prep_audit/1', version: 1, audit_id: 'a1', prep_id: 'p1', environment_id: FROZEN_ENVIRONMENT, final_state: 'BLOCKED', independent_observer_established: false, changes_applied_count: 0, m9_state: 'UNVERIFIED', m8_state: 'EXECUTION_BLOCKED', timestamp: G.FIXED() },
    { schema: 'dkskill.network_isolation_prep_audit/1', version: 1, audit_id: 'a2', prep_id: 'p2', environment_id: FROZEN_ENVIRONMENT, final_state: 'BLOCKED', independent_observer_established: false, changes_applied_count: 0, m9_state: 'UNVERIFIED', m8_state: 'EXECUTION_BLOCKED', timestamp: G.FIXED() },
  ] as any);
  assert.equal(verifyAuditChain(chain), true);
  assert.equal(verifyAuditChain([{ ...chain[0], final_state: 'PREPARED_FOR_L4_VERIFICATION' as const }, chain[1]]), false);
  const t = G.tamperedAuditDemo();
  assert.notEqual(auditRecordHash({ ...t, record_hash: undefined } as any), t.record_hash);
});

test('17. static safety: engine performs no network/shell/OS-mutation', () => {
  const mod = readFileSync(join(DIR, 'network-isolation-prep.ts'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|net\.connect|http\.request|https\.request|child_process|execSync|execFileSync/.test(mod));
  assert.ok(!/netsh\s+advfirewall\s+set|Set-Net|New-NetFirewallRule|Remove-Net|route\s+(add|delete)|Disable-Net|Set-DnsClient/.test(mod));
});

test('18. deterministic output; committed == fresh; /runtime absent; no secrets', () => {
  assert.equal(canonicalFile(f.currentReal()), canonicalFile(f.currentReal()));
  assert.equal(canonicalFile(f.observerAvailablePrepared()), canonicalFile(f.observerAvailablePrepared()));
  const files: [string, unknown][] = [
    ['nprep-sample-current-real-blocked.json', f.currentReal()],
    ['nprep-sample-self-report-observer-rejected.json', f.selfReportObserverRejected()],
    ['nprep-sample-observer-available-prepared.json', f.observerAvailablePrepared()],
    ['nprep-sample-overbroad-blocked.json', f.overbroadChangeBlocked()],
    ['nprep-sample-apply-failure.json', f.applyFailure()],
    ['nprep-sample-synthetic-prepared-mechanics.json', f.syntheticPreparedMechanics()],
  ];
  for (const [name, obj] of files) assert.equal(readFileSync(join(DIR, name), 'utf8'), canonicalFile(obj), name);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6})/i.test(JSON.stringify(f.observerAvailablePrepared())));
});
