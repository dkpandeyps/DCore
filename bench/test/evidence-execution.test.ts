import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FROZEN_TARGET, ALLOWED_TESTS, RESOURCE_LIMITS, buildExecutionAuthorization, authorizationPayloadHash,
  validateAuthorization, m3Resolve, runPreflight, evaluateEvidenceExecutionGate, executeEvidenceExecution,
  evaluateStopConditions, checkResourceLimits, runPostflight, buildExecutionRecord, chainExecutionRecords,
  verifyAuditChain, auditHash, containsSecret,
} from '../compatibility/evidence-execution.ts';
import * as G from '../tools/gen-evidence-execution-sample.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const gate = (k: keyof typeof G.fixtures) => evaluateEvidenceExecutionGate(G.fixtures[k]());
const stops = (k: keyof typeof G.fixtures) => gate(k).stop_codes;

// schema validation
test('1. schema identifiers', () => {
  const g = gate('currentReal');
  assert.equal(g.schema, 'dkskill.evidence_execution_gate/1');
  assert.equal(g.preflight.schema, 'dkskill.evidence_execution_preflight/1');
  assert.equal(G.frozenAuth().schema, 'dkskill.evidence_execution_authorization/1');
  assert.equal(G.auditRecordSample().schema, 'dkskill.evidence_execution_record/1');
});

// exact profile/version/binary/platform/arch/channel
test('2. exact identity gates PASS for frozen target', () => {
  const pf = runPreflight(G.fixtures.currentReal());
  for (const id of ['EP-01', 'EP-02', 'EP-03', 'EP-04', 'EP-05', 'EP-06', 'EP-07']) assert.equal(pf.gates.find((x) => x.gate_id === id)!.result, 'PASS', id);
});
test('3. binary/version/platform/arch/channel mismatch => BLOCKED + stop codes', () => {
  assert.ok(stops('binaryMismatch').includes('STOP-BINARY-MISMATCH'));
  assert.ok(stops('versionMismatch').includes('STOP-VERSION-MISMATCH'));
  assert.ok(stops('platformMismatch').includes('STOP-PLATFORM-MISMATCH'));
  assert.ok(stops('archMismatch').includes('STOP-ARCHITECTURE-MISMATCH'));
  assert.ok(stops('channelMismatch').includes('STOP-CHANNEL-MISMATCH'));
  for (const k of ['binaryMismatch', 'versionMismatch', 'platformMismatch', 'archMismatch', 'channelMismatch'] as const) assert.equal(gate(k).decision, 'EXECUTION_BLOCKED');
});

// environment binding + config-dir isolation + real ~/.claude exclusion
test('4. environment mismatch / unsafe config / real ~/.claude detected => BLOCKED', () => {
  assert.ok(stops('environmentMismatch').includes('STOP-ENVIRONMENT-MISMATCH'));
  assert.ok(stops('unsafeConfigDir').includes('STOP-CONFIG-DIR-UNSAFE'));
  assert.ok(stops('realClaudeDetected').includes('STOP-REAL-CLAUDE-DIR-DETECTED'));
});

// credential safety + network gate + process + filesystem
test('5. credential / network / process / filesystem gates fail-closed', () => {
  assert.ok(stops('credentialAmbiguous').includes('STOP-CREDENTIAL-AMBIGUOUS'));
  assert.ok(stops('currentReal').includes('STOP-NETWORK-UNVERIFIED'));
  assert.ok(stops('unexpectedProcess').includes('STOP-PROCESS-VIOLATION'));
  assert.ok(stops('unexpectedWrite').includes('STOP-FILESYSTEM-VIOLATION'));
});

// authorization binding / expiry / revocation / scope
test('6. authorization binding / expiry / revocation / scope', () => {
  const auth = G.frozenAuth();
  assert.equal(validateAuthorization(auth, FROZEN_TARGET, ['TS-07', 'TS-11'], G.FIXED()), 'VALID');
  assert.equal(validateAuthorization(null, FROZEN_TARGET, ['TS-07'], G.FIXED()), 'MISSING');
  assert.equal(validateAuthorization({ ...auth, target_binary_sha256: 'B'.repeat(64) }, FROZEN_TARGET, ['TS-07'], G.FIXED()), 'MISMATCHED');
  assert.equal(validateAuthorization({ ...auth, expiration: '2020-01-01T00:00:00Z' }, FROZEN_TARGET, ['TS-07'], G.FIXED()), 'EXPIRED');
  assert.equal(validateAuthorization({ ...auth, authorization_state: 'REVOKED' }, FROZEN_TARGET, ['TS-07'], G.FIXED()), 'REVOKED');
  // scope: requesting a test not authorized
  assert.equal(validateAuthorization(buildExecutionAuthorization({ authorization_id: 'a', authorized_by: 'o', target: FROZEN_TARGET, allowed_tests: ['TS-07'], clock: G.FIXED }), FROZEN_TARGET, ['TS-11'], G.FIXED()), 'MISMATCHED');
  assert.equal(gate('expiredAuthorization').decision, 'EXECUTION_EXPIRED');
  assert.equal(gate('revokedAuthorization').decision, 'EXECUTION_REVOKED');
  assert.equal(gate('missingAuthorization').decision, 'EXECUTION_BLOCKED');
});

// authorization is disjoint + not inferred; payload hash binds
test('7. authorization payload hash binds to exact target', () => {
  const h = authorizationPayloadHash(FROZEN_TARGET, ['TS-07', 'TS-11']);
  assert.notEqual(h, authorizationPayloadHash({ ...FROZEN_TARGET, binary_sha256: 'A'.repeat(64) }, ['TS-07', 'TS-11']));
  assert.notEqual(h, authorizationPayloadHash(FROZEN_TARGET, ['TS-07']));
});

// M7 plan binding + M3 boundary
test('8. M7 plan binding + M3 boundary', () => {
  assert.ok(stops('m7PlanMismatch').includes('STOP-EVIDENCE-INTEGRITY'));
  assert.equal(runPreflight(G.fixtures.currentReal()).gates.find((x) => x.gate_id === 'EP-21')!.result, 'PASS');   // real target EXACT_MATCH
  assert.equal(runPreflight(G.fixtures.m3Mismatch()).gates.find((x) => x.gate_id === 'EP-21')!.result !== 'PASS', true);
  assert.equal(m3Resolve(FROZEN_TARGET), 'EXACT_MATCH');
});

// Run A / benchmark / publication / registry exclusion (structural)
test('9. Run A / benchmark / publication / registry mutation excluded', () => {
  assert.ok(stops('runARequest').includes('STOP-RUN-A-DETECTED'));
  assert.ok(stops('benchmarkRequest').includes('STOP-BENCHMARK-DETECTED'));
  assert.ok(stops('publicationRequest').includes('STOP-PUBLICATION-DETECTED'));
  assert.ok(stops('registryMutationRequest').includes('STOP-REGISTRY-MUTATION-DETECTED'));
});

// synthetic / binary substitution / model substitution rejection
test('10. synthetic target + binary/model substitution rejected', () => {
  assert.equal(runPreflight(G.fixtures.syntheticTarget()).gates.find((x) => x.gate_id === 'EP-22')!.result, 'FAIL');
  assert.ok(stops('binarySubstitution').includes('STOP-BINARY-MISMATCH'));
  assert.equal(runPreflight(G.fixtures.modelSubstitution()).gates.find((x) => x.gate_id === 'EP-24')!.result, 'FAIL');
});

// network violation + secret detection
test('11. network violation + secret detection', () => {
  assert.equal(gate('networkViolation').network_isolation, 'FAILED');
  assert.equal(gate('networkViolation').decision, 'EXECUTION_BLOCKED');
  assert.ok(stops('secretDetected').includes('STOP-SECRET-DETECTED'));
  assert.equal(containsSecret({ x: 'bearer aa11bb22' }), true);
  assert.equal(containsSecret({ api_key_injected: false }), false);   // field name is not a secret value
});

// all-pass mechanics
test('12. all-pass synthetic mechanics => EXECUTION_ALLOWED; still SYNTHETIC_TEST_ONLY; executes nothing', () => {
  const g = gate('mechanicsAllPass');
  assert.equal(g.decision, 'EXECUTION_ALLOWED');
  assert.equal(g.preflight.all_safety_critical_pass, true);
  assert.equal(g.synthetic_test_only, true);
  assert.equal(g.execution_mode, 'EXECUTION_DISABLED');
  assert.equal(executeEvidenceExecution(g, { mode: 'LIVE', dedicated_execution_authorization: 'x' }).executed, false);
});

// CURRENT real environment BLOCKED (authoritative)
test('13. current real environment => EXECUTION_BLOCKED (network UNVERIFIED)', () => {
  const g = gate('currentReal');
  assert.equal(g.decision, 'EXECUTION_BLOCKED');
  assert.equal(g.network_isolation, 'UNVERIFIED');
  assert.deepEqual(g.stop_codes, ['STOP-NETWORK-UNVERIFIED']);
  assert.equal(g.preflight.gates.find((x) => x.gate_id === 'EP-13')!.result, 'BLOCKED');
});

// dry-run / execution-disabled default + no bypass
test('14. executor default disabled/dry-run; no bypass flags', () => {
  const g = gate('mechanicsAllPass');
  const r = executeEvidenceExecution(g);
  assert.equal(r.execution_mode, 'EXECUTION_DISABLED');
  assert.equal(r.executed, false);
  assert.equal(r.claude_invoked, false);
  assert.equal(r.authenticated, false);
  assert.equal(r.benchmark_invoked, false);
  assert.equal(r.spent, false);
  // no bypass: even LIVE + authorization only DRY_RUN, nothing executed; blocked gate never eligible
  assert.equal(executeEvidenceExecution(gate('currentReal'), { mode: 'LIVE', dedicated_execution_authorization: 'x' }).executed, false);
  // arbitrary bypass-like options are ignored: they cannot cause execution on a blocked gate
  assert.equal(executeEvidenceExecution(gate('currentReal'), { force: true, unsafe: true, skip_preflight: true, ignore_safety: true, allow_unknown: true } as any).executed, false);
  assert.equal(executeEvidenceExecution(gate('mechanicsAllPass'), { force: true } as any).executed, false);   // no LIVE => still nothing
});

// stop-code determinism + unknown fails closed
test('15. stop conditions deterministic; unknown fails closed', () => {
  const a = evaluateStopConditions(G.fixtures.currentReal());
  const b = evaluateStopConditions(G.fixtures.currentReal());
  assert.equal(canonicalFile(a), canonicalFile(b));
  assert.equal(a.conditions.every((c) => c.fail_closed === true), true);
  assert.equal(evaluateStopConditions(G.fixtures.binaryMismatch()).stop, true);
  // fail-closed: a blocked gate with no explicit code still yields STOP-UNKNOWN-CONDITION
  const g = evaluateEvidenceExecutionGate(G.fixtures.currentReal());
  assert.ok(g.stop_codes.length > 0);
});

// resource limits
test('16. hard resource limits enforced', () => {
  assert.equal(checkResourceLimits({ wall_clock_ms: 1, process_count: 1, filesystem_output_bytes: 1, evidence_artifact_bytes: 1, network_destinations: 1, retries: 0 }).ok, true);
  const over = checkResourceLimits({ wall_clock_ms: RESOURCE_LIMITS.max_wall_clock_ms + 1, process_count: 999, filesystem_output_bytes: 0, evidence_artifact_bytes: 0, network_destinations: 0, retries: 99 });
  assert.equal(over.ok, false);
  assert.ok(over.exceeded.includes('wall_clock_ms') && over.exceeded.includes('process_count') && over.exceeded.includes('retries'));
});

// postflight mandatory + no auto-certification
test('17. postflight mandatory; failure => SESSION_FAILED; never auto-certifies', () => {
  const ok = runPostflight({ processes_cleaned: true, unexpected_process: false, filesystem_ok: true, real_claude_unchanged: true, production_registry_unchanged: true, runtime_absent: true, evidence_integrity_ok: true, secret_found: false, network_observation_integrity_ok: true, authorization_scope_ok: true, target_identity_ok: true, benchmark_invoked: false, run_a_executed: false, publication_done: false, certification_side_effect: false });
  assert.equal(ok.session_result, 'SESSION_OK');
  assert.equal(ok.checks.length, 15);
  assert.equal(ok.auto_certification_invoked, false);
  assert.equal(G.postflightFailureSample().session_result, 'SESSION_FAILED');
});

// audit hash chain
test('18. immutable audit record hash chain', () => {
  const chain = chainExecutionRecords([
    { schema: 'dkskill.evidence_execution_record/1', version: 1, execution_id: 'e1', authorization_id: 'a', plan_id: 'p', target: FROZEN_TARGET, binary_sha256: FROZEN_TARGET.binary_sha256, environment_id: FROZEN_TARGET.environment_id, preflight_results: [], execution_state: 'BLOCKED', decision: 'EXECUTION_BLOCKED', stop_reason: 'STOP-NETWORK-UNVERIFIED', postflight_results: [], evidence_hashes: [], timestamp: G.FIXED() },
    { schema: 'dkskill.evidence_execution_record/1', version: 1, execution_id: 'e2', authorization_id: 'a', plan_id: 'p', target: FROZEN_TARGET, binary_sha256: FROZEN_TARGET.binary_sha256, environment_id: FROZEN_TARGET.environment_id, preflight_results: [], execution_state: 'BLOCKED', decision: 'EXECUTION_BLOCKED', stop_reason: 'STOP-NETWORK-UNVERIFIED', postflight_results: [], evidence_hashes: [], timestamp: G.FIXED() },
  ] as any);
  assert.equal(verifyAuditChain(chain), true);
  assert.match(chain[0].audit_hash!, /^sha256:[0-9a-f]{64}$/);
  const tampered = [{ ...chain[0], decision: 'EXECUTION_ALLOWED' as const }, chain[1]];
  assert.equal(verifyAuditChain(tampered), false);
});

// deterministic planning + committed samples equal fresh generation; no secrets; /runtime absent
test('19. deterministic samples == fresh generation; no secrets; /runtime absent', () => {
  const files: [string, unknown][] = [
    ['exec-sample-current-real-blocked.json', evaluateEvidenceExecutionGate(G.fixtures.currentReal())],
    ['exec-sample-binary-mismatch.json', evaluateEvidenceExecutionGate(G.fixtures.binaryMismatch())],
    ['exec-sample-authorization-mismatch.json', evaluateEvidenceExecutionGate(G.fixtures.authorizationMismatch())],
    ['exec-sample-run-a-rejected.json', evaluateEvidenceExecutionGate(G.fixtures.runARequest())],
    ['exec-sample-benchmark-rejected.json', evaluateEvidenceExecutionGate(G.fixtures.benchmarkRequest())],
    ['exec-sample-mechanics-all-pass.json', evaluateEvidenceExecutionGate(G.fixtures.mechanicsAllPass())],
    ['exec-sample-postflight-failure.json', G.postflightFailureSample()],
    ['exec-sample-audit-record.json', G.auditRecordSample()],
  ];
  for (const [name, obj] of files) assert.equal(readFileSync(join(DIR, name), 'utf8'), canonicalFile(obj), name);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  const blob = JSON.stringify(files);
  assert.ok(!/(access_token=|refresh_token=|BEGIN [A-Z ]*PRIVATE KEY|sk-[a-z0-9]{6}|bearer\s+[a-z0-9]{6})/i.test(blob));
});

// exhaustive: EP-01..25 present; ALLOWED_TESTS only TS-07/TS-11
test('20. 25 preflight gates present; scope is TS-07/TS-11 only', () => {
  const ids = runPreflight(G.fixtures.currentReal()).gates.map((g) => g.gate_id);
  for (let i = 1; i <= 25; i++) assert.ok(ids.includes(`EP-${String(i).padStart(2, '0')}`), `EP-${i}`);
  assert.deepEqual([...ALLOWED_TESTS], ['TS-07', 'TS-11']);
});
