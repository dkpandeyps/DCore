import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHASE4_DECISIONS, phase4Decided, phase4ModelIds } from '../src/phase4-register.ts';
import { checkRunAuthorization } from '../src/guard.ts';
import { planRunA } from '../src/runA.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const BENCH = join(TEST_DIR, '..');

test('the register records the ten Phase 4 decisions with the owner values', () => {
  assert.deepEqual(Object.keys(PHASE4_DECISIONS).sort(), ['APPROVE-AUTHENTICATE-CLAUDE', 'APPROVE-ENABLE-REAL-SESSIONS', 'APPROVE-PROVISION-ISOLATED-ENV', 'BQ-01', 'BQ-03', 'BQ-05', 'BQ-06', 'BQ-19', 'TS-05-EVIDENCE', 'TS-05-MECHANISM']);
  for (const id of Object.keys(PHASE4_DECISIONS)) assert.equal(phase4Decided(id), true, id);
  const b1 = PHASE4_DECISIONS['BQ-01'].value;
  assert.equal(b1.night_usd, 100); assert.equal(b1.release_usd, 500);
  assert.equal(b1.hard_cap, true); assert.equal(b1.spend_authorized_this_turn, false);
  assert.equal(PHASE4_DECISIONS['BQ-03'].value.k, 30);
  assert.equal(PHASE4_DECISIONS['BQ-03'].value.per_severity_exceptions, false);
  assert.deepEqual(phase4ModelIds(), { flagship: 'claude-opus-5', mid_tier: 'claude-sonnet-5' });
  assert.equal(PHASE4_DECISIONS['BQ-05'].value.silent_substitution, false);
  assert.equal(PHASE4_DECISIONS['BQ-05'].value.on_unavailable, 'STOP and report');
  assert.equal(PHASE4_DECISIONS['BQ-06'].value.retention_raw_days, 30);
  assert.equal(PHASE4_DECISIONS['BQ-06'].value.retention_summary_days, 90);
  assert.equal(PHASE4_DECISIONS['BQ-06'].value.public_access, false);
  assert.equal(PHASE4_DECISIONS['BQ-19'].value.never_copy_credentials_from_real_config, true);
  assert.equal(PHASE4_DECISIONS['BQ-19'].value.on_isolation_failure, 'STOP (no fallback to the real user environment)');
});

test('the two TS-05 owner decisions are recorded APPROVED but do NOT resolve TS-05', () => {
  const m = PHASE4_DECISIONS['TS-05-MECHANISM'].value;
  assert.equal(m.owner_approval, 'APPROVED');
  assert.equal(m.decision, 'external environment specification required');
  assert.equal(m.repository_specification_sufficient, false);
  assert.equal(m.candidate_is_validated_mechanism, false);
  assert.equal(m.mechanism_provisioned, false);
  assert.equal(m.ts05_spike_resolved, false);
  const e = PHASE4_DECISIONS['TS-05-EVIDENCE'].value;
  assert.equal(e.owner_approval, 'APPROVED');
  assert.deepEqual(e.proposed_fields, ['mechanism_id', 'mechanism_policy_id/hash', 'egress_blocked', 'loopback_reachable', 'verified_at', 'run_id', 'environment_id', 'loopback_allowance = 127.0.0.1', 'non_loopback_egress_check', 'snapshot_network_isolation_mechanism']);
  assert.equal(e.ts05_spike_resolved, false);
  // Provenance back to the authoritative sources.
  for (const ref of [/TS-05-OWNER-DECISION-PACKET/, /§3\.3/, /§5\.1/, /§6\.4/, /U-14/, /B-6/, /Q22/, /BQ-19/, /VG-06/]) {
    assert.ok(PHASE4_DECISIONS['TS-05-MECHANISM'].source_refs.some((s) => ref.test(s)), String(ref));
  }
  // Recording did not resolve TS-05: planRunA still lists it as a blocker.
  assert.ok(planRunA().blockers.some((b) => b.id === 'TS-05'));
});

test('APPROVE-PROVISION-ISOLATED-ENV records only the provisioning approval and opens no gate', () => {
  const v = PHASE4_DECISIONS['APPROVE-PROVISION-ISOLATED-ENV'].value;
  assert.equal(v.owner_approval, 'APPROVED');
  assert.equal(v.approver, 'DK Pandey');
  assert.equal(v.environment_id, 'PTPL-DK-BENCH-WIN-01');
  assert.equal(v.authorizes_provisioning, true);
  // every other segmented action stays false; the spikes are not resolved; no gate opened; nothing provisioned.
  for (const k of ['authorizes_authentication', 'authorizes_real_sessions', 'authorizes_ts07_capture', 'authorizes_ts11_calibration', 'authorizes_run_a', 'resolves_ts02_ts05_ts07_ts11', 'opens_execution_gate', 'provisioning_performed']) {
    assert.equal(v[k], false, k);
  }
  assert.ok(PHASE4_DECISIONS['APPROVE-PROVISION-ISOLATED-ENV'].source_refs.some((s) => /PHASE-4\.5-OWNER-ENVIRONMENT-SPECIFICATION/.test(s)));
  // The execution gate is unchanged.
  assert.equal(checkRunAuthorization().authorized, false);
  assert.equal(planRunA().may_start, false);
  assert.ok(['TS-02', 'TS-05', 'TS-07', 'TS-11'].every((id) => planRunA().blockers.some((b) => b.id === id)));
});

test('APPROVE-AUTHENTICATE-CLAUDE records only isolated-auth approval; authenticates nothing and resolves no TS-02', () => {
  const v = PHASE4_DECISIONS['APPROVE-AUTHENTICATE-CLAUDE'].value;
  assert.equal(v.owner_approval, 'APPROVED');
  assert.equal(v.environment_id, 'PTPL-DK-BENCH-WIN-01');
  assert.equal(v.authorizes_authentication, true);
  for (const k of ['authorizes_real_sessions', 'authorizes_ts07_capture', 'authorizes_ts11_calibration', 'authorizes_run_a', 'authorizes_benchmark_spend', 'authorizes_model_substitution', 'authorizes_network_policy_change', 'authorizes_real_claude_use_or_copy', 'authentication_performed', 'ts02_resolved', 'opens_execution_gate']) {
    assert.equal(v[k], false, k);
  }
  assert.equal(checkRunAuthorization().authorized, false);
  assert.equal(planRunA().may_start, false);
});

test('APPROVE-ENABLE-REAL-SESSIONS is narrowly scoped to the TS-02 evidence session and opens no gate', () => {
  const v = PHASE4_DECISIONS['APPROVE-ENABLE-REAL-SESSIONS'].value;
  assert.equal(v.owner_approval, 'APPROVED');
  assert.equal(v.environment_id, 'PTPL-DK-BENCH-WIN-01');
  assert.equal(v.authorizes_real_session_for_ts02_evidence, true);
  assert.equal(v.authorizes_produce_attempt2_and_transcript, true);
  for (const k of ['authorizes_run_a', 'authorizes_benchmark_case_execution', 'authorizes_benchmark_spend', 'authorizes_ts07_capture', 'authorizes_ts11_calibration', 'authorizes_ts05_network_validation', 'authorizes_model_substitution', 'authorizes_real_claude_use_or_copy', 'session_performed', 'ts02_resolved', 'opens_execution_gate']) {
    assert.equal(v[k], false, k);
  }
  assert.equal(checkRunAuthorization().authorized, false);
  assert.equal(planRunA().may_start, false);
});

test('BQ-05 and BQ-19 cross-reference the already-approved sources and do not claim to resolve spikes', () => {
  assert.ok(PHASE4_DECISIONS['BQ-05'].source_refs.some((s) => /OWNER-DECISION-PACKET-R0/.test(s)));
  assert.ok(PHASE4_DECISIONS['BQ-01'].source_refs.some((s) => /OWNER-DECISION-PACKET-R0/.test(s)));
  assert.match(PHASE4_DECISIONS['BQ-19'].scope_note, /Does NOT resolve TS-02, TS-05, TS-07 or TS-11/);
});

test('recording the register does NOT open the execution gate: Run A stays blocked', () => {
  // The execution gate reads the frozen Phase 3 register, not this Phase 4 register, so it is unchanged.
  assert.equal(checkRunAuthorization().authorized, false);
  const p = planRunA();
  assert.equal(p.may_start, false);
  // The real-Claude authorization still lists the BQ prerequisites as pending (frozen-doc view, intentionally).
  assert.ok(p.blockers.length > 0);
});

test('committed register artifact equals a fresh deterministic generation', () => {
  const doc = {
    banner: 'PHASE 4 DECISION REGISTER — owner-approved. Recording only; does not authorize execution, spend, or Run A.',
    date: PHASE4_DECISIONS['BQ-01'].date,
    note: 'Created because the Phase 3 BQ table is frozen and must not be edited. This register is the authoritative Phase 4 record for BQ-01, BQ-03, BQ-05, BQ-06, BQ-19, the TS-05 owner decisions (TS-05-MECHANISM, TS-05-EVIDENCE), and the segmented approvals APPROVE-PROVISION-ISOLATED-ENV, APPROVE-AUTHENTICATE-CLAUDE, and APPROVE-ENABLE-REAL-SESSIONS. The harness execution gate (guard.checkRunAuthorization / planRunA) is intentionally NOT wired to this register, so Run A stays blocked and no real Claude session is authorized. Recording the TS-05 decisions does NOT resolve TS-05; recording APPROVE-PROVISION-ISOLATED-ENV authorizes only provisioning+validation of the isolated environment and performs no provisioning; recording APPROVE-AUTHENTICATE-CLAUDE authorizes only isolated authentication for TS-02 and performs no authentication; recording APPROVE-ENABLE-REAL-SESSIONS authorizes only the single real authenticated session that produces the TS-02 evidence (no Run A, case execution, spend, TS-05/07/11) and performs no session.',
    decisions: PHASE4_DECISIONS,
  };
  assert.equal(readFileSync(join(BENCH, 'PHASE-4-DECISION-REGISTER.json'), 'utf8'), canonicalFile(doc));
});
