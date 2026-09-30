import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  provisionBenchEnv, verifyBenchEnv, buildReadinessEvidence, readinessRecordHash, chainValid,
  readinessState, checkModelPinning, validateTs05Structure, deriveNetworkVerified, EnvironError,
  type ExternalInputs, type Ts05Evidence, type BenchEnv,
} from '../src/environ.ts';
import { REAL_CLAUDE_DIR, GuardError, checkRunAuthorization, protectedRoots } from '../src/guard.ts';
import { planRunA } from '../src/runA.ts';
import { phase4ModelIds } from '../src/phase4-register.ts';
import { tempDir } from './helpers.ts';

const OPTS = (extra: Partial<ExternalInputs> = {}) => ({ attemptId: 'att-synthetic', envId: 'env-synthetic', external: extra });

// A complete, well-formed (synthetic) external input set — used to exercise the forward states.
function fullExternal(): ExternalInputs {
  const m = phase4ModelIds();
  const ts05: Ts05Evidence = {
    mechanism_id: 'vm-egress-01', mechanism_policy_id: 'policy-hash-abc', egress_blocked: true, loopback_reachable: true,
    verified_at: '2026-09-28T00:00:00Z', run_id: 'run-x', environment_id: 'env-x',
    loopback_allowance: '127.0.0.1', non_loopback_egress_check: 'blocked', snapshot_network_isolation_mechanism: 'vm-egress-01@policy-hash-abc',
  };
  return { cli: { version: '2.1.283', binary_hash: 'sha256:deadbeef' }, models: { flagship: m.flagship, mid_tier: m.mid_tier }, ts05, auth_reference: 'isolated-login-ref://benchmark' };
}

test('provisions a fresh isolated benchmark environment with the required structure', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'benchenv'), OPTS());
    assert.equal(env.schema, 'aebs.benchenv/1');
    assert.ok(existsSync(env.config_dir) && existsSync(env.mcp_config_dir) && existsSync(env.ws));
    assert.ok(existsSync(join(env.ws, 'protected')));
    // No credentials were written by the harness.
    for (const f of ['.credentials.json', 'credentials.json', '.claude.json']) assert.ok(!existsSync(join(env.config_dir, f)));
  } finally { t.cleanup(); }
});

test('a fresh env requires an empty root', () => {
  const t = tempDir('environ');
  try {
    provisionBenchEnv(join(t.dir, 'e'), OPTS());
    assert.throws(() => provisionBenchEnv(join(t.dir, 'e'), OPTS()), EnvironError);  // second time: not empty
  } finally { t.cleanup(); }
});

test('the isolation guard rejects the real ~/.claude as a benchmark root', () => {
  assert.throws(() => provisionBenchEnv(REAL_CLAUDE_DIR, OPTS()), GuardError);
  assert.throws(() => provisionBenchEnv(join(REAL_CLAUDE_DIR, 'bench'), OPTS()), GuardError);
});

test('verification passes the repo-controllable checks and marks external inputs pending', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS());
    const checks = verifyBenchEnv(env);
    const by = new Map(checks.map((c) => [c.check, c]));
    for (const k of ['config_dir_isolated', 'real_claude_not_target', 'per_attempt_state_fresh', 'required_dirs_exist', 'workspace_structure', 'strict_mcp_representable', 'no_credential_copy']) {
      assert.equal(by.get(k)!.status, 'PASS', k);
    }
    assert.equal(by.get('cli_identity_input')!.status, 'MISSING');
    assert.equal(by.get('model_ids_match_bq05')!.status, 'MISSING');
    assert.equal(by.get('ts05_external_dependency')!.status, 'EXTERNAL_PENDING');
  } finally { t.cleanup(); }
});

test('missing external inputs are represented, never invented', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS());
    const ev = buildReadinessEvidence(env);
    assert.equal(ev.cli.version, null);
    assert.equal(ev.cli.binary_hash, null);
    assert.equal(ev.models.flagship, null);
    assert.equal(ev.models.matches_bq05, null);
    assert.equal(ev.auth_reference, null);
    assert.equal(ev.network_isolation_verified, null);   // pending, not fabricated
    assert.equal(ev.validation_result, 'PASS');           // repo-controllable checks pass
  } finally { t.cleanup(); }
});

test('exact CLI/model identity is recorded as input; BQ-05 mismatch is flagged, never substituted', () => {
  const m = phase4ModelIds();
  assert.deepEqual(checkModelPinning(m).status, 'PRESENT_INPUT');
  assert.equal(checkModelPinning(undefined).status, 'MISSING');
  const wrong = checkModelPinning({ flagship: 'some-other-model', mid_tier: m.mid_tier });
  assert.equal(wrong.status, 'FAIL');
  assert.equal(wrong.matches, false);
  assert.match(wrong.detail, /no substitution/);
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS({ cli: { version: '2.1.283', binary_hash: 'sha256:abc' }, models: m }));
    const ev = buildReadinessEvidence(env);
    assert.equal(ev.cli.version, '2.1.283');
    assert.equal(ev.cli.binary_hash, 'sha256:abc');
    assert.equal(ev.models.matches_bq05, true);
  } finally { t.cleanup(); }
});

test('evidence hash is deterministic and the chain is tamper-evident', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS());
    const r1 = buildReadinessEvidence(env, { prev_hash: null });
    // deterministic: recomputed hash matches
    const { record_hash, ...rest } = r1;
    assert.equal(readinessRecordHash(rest), record_hash);
    const r2 = buildReadinessEvidence(env, { prev_hash: r1.record_hash });
    assert.equal(chainValid([r1, r2]), true);
    // tamper: mutate a field without recomputing the hash -> chain invalid
    const tampered = { ...r2, env_id: 'env-tampered' };
    assert.equal(chainValid([r1, tampered]), false);
    // broken link: wrong prev_hash -> invalid
    const rebased = buildReadinessEvidence(env, { prev_hash: 'sha256:wrong' });
    assert.equal(chainValid([r1, rebased]), false);
  } finally { t.cleanup(); }
});

test('TS-05 evidence completeness is validated by structure; verification is never fabricated', () => {
  assert.equal(validateTs05Structure(undefined).complete, false);
  assert.equal(validateTs05Structure({ mechanism_id: 'x' }).complete, false);
  assert.equal(validateTs05Structure(fullExternal().ts05).complete, true);
  // derive: missing -> null; incomplete (no egress_blocked) -> null; explicit false -> false; full approved -> true.
  assert.equal(deriveNetworkVerified(undefined), null);
  assert.equal(deriveNetworkVerified({ loopback_reachable: true }), null);
  assert.equal(deriveNetworkVerified({ egress_blocked: false }), false);
  assert.equal(deriveNetworkVerified(fullExternal().ts05), true);
  // a wrong loopback allowance must NOT count as verified.
  assert.equal(deriveNetworkVerified({ ...fullExternal().ts05!, loopback_allowance: '0.0.0.0' }), null);
});

test('readiness-state transitions reflect the external boundary', () => {
  const t = tempDir('environ');
  try {
    // no external inputs -> repo prep complete
    const env0 = provisionBenchEnv(join(t.dir, 'a'), OPTS());
    assert.equal(readinessState(buildReadinessEvidence(env0)), 'REPO_PREP_COMPLETE');
    // partial external (cli only) -> inputs missing
    const env1 = provisionBenchEnv(join(t.dir, 'b'), OPTS({ cli: { version: '2.1.283', binary_hash: 'sha256:abc' } }));
    assert.equal(readinessState(buildReadinessEvidence(env1)), 'EXTERNAL_INPUTS_MISSING');
    // full inputs but no network isolation -> external env not verified
    const noNet = { ...fullExternal(), ts05: undefined };
    const env2 = provisionBenchEnv(join(t.dir, 'c'), OPTS(noNet));
    assert.equal(readinessState(buildReadinessEvidence(env2)), 'EXTERNAL_ENV_NOT_VERIFIED');
    // full inputs + externally verified network -> ready for owner authorization (gate still closed)
    const env3 = provisionBenchEnv(join(t.dir, 'd'), OPTS(fullExternal()));
    assert.equal(readinessState(buildReadinessEvidence(env3)), 'READY_FOR_OWNER_AUTHORIZATION');
  } finally { t.cleanup(); }
});

test('readiness never marks unresolved external conditions verified, and never opens Run A', () => {
  const t = tempDir('environ');
  try {
    // Even with a fully-populated (synthetic) external set, the real gate stays closed, so state is at most
    // READY_FOR_OWNER_AUTHORIZATION and Run A remains unauthorized.
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS(fullExternal()));
    const ev = buildReadinessEvidence(env);
    const state = readinessState(ev);
    assert.notEqual(state, 'AUTHORIZED_FOR_RUN_A');
    assert.equal(planRunA().may_start, false);
    assert.equal(checkRunAuthorization().authorized, false);
    // Without external ts05, network_isolation_verified must be null (never fabricated true).
    const envNoNet = provisionBenchEnv(join(t.dir, 'f'), OPTS());
    assert.equal(buildReadinessEvidence(envNoNet).network_isolation_verified, null);
  } finally { t.cleanup(); }
});

// ---- F6(a): protected-root rejection at the environ layer (not only real ~/.claude) ----
test('provisioning is refused for protected repository roots (benchmark-design / platform-validation)', () => {
  const protectedNonHome = protectedRoots().filter((p) => p !== REAL_CLAUDE_DIR);
  assert.ok(protectedNonHome.length >= 1);
  for (const root of protectedNonHome) {
    assert.throws(() => provisionBenchEnv(root, OPTS()), GuardError, root);
    assert.throws(() => provisionBenchEnv(join(root, 'sub'), OPTS()), GuardError, `${root}/sub`);
  }
});

// ---- F6(b): AUTHORIZED_FOR_RUN_A requires BOTH an authorized gate AND may_start (test doubles only) ----
test('readinessState reaches AUTHORIZED_FOR_RUN_A only when BOTH injected gate doubles are open', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS(fullExternal()));
    const ev = buildReadinessEvidence(env);
    const openAuth = () => ({ authorized: true, decisions: [], missing: [], source_sha256: null }) as any;
    const closedAuth = () => ({ authorized: false, decisions: [], missing: [], source_sha256: null }) as any;
    const openPlan = () => ({ may_start: true, blockers: [], cases: [], nm_to_calibrate: [] }) as any;
    const closedPlan = () => ({ may_start: false, blockers: [], cases: [], nm_to_calibrate: [] }) as any;
    assert.equal(readinessState(ev, openAuth, openPlan), 'AUTHORIZED_FOR_RUN_A');           // both open
    assert.equal(readinessState(ev, openAuth, closedPlan), 'READY_FOR_OWNER_AUTHORIZATION'); // auth open, plan closed
    assert.equal(readinessState(ev, closedAuth, openPlan), 'READY_FOR_OWNER_AUTHORIZATION'); // auth closed, plan open
    // The real (default) gate is closed, so the real call never authorizes.
    assert.notEqual(readinessState(ev), 'AUTHORIZED_FOR_RUN_A');
  } finally { t.cleanup(); }
});

// ---- F6(c) + F1: a repository-check FAIL yields REPO_PREP_FAILED (distinct from EXTERNAL_INPUTS_MISSING) ----
test('a repo-check failure maps to REPO_PREP_FAILED with validation_result FAIL', () => {
  // Construct a BenchEnv whose config_dir IS the real ~/.claude so repo checks fail (never provisioned).
  const bad: BenchEnv = {
    schema: 'aebs.benchenv/1', env_id: 'env-bad', root: REAL_CLAUDE_DIR, config_dir: REAL_CLAUDE_DIR,
    mcp_config_dir: join(REAL_CLAUDE_DIR, 'mcp'),
    run_root: { root: join(REAL_CLAUDE_DIR, 'nope-R'), ws: join(REAL_CLAUDE_DIR, 'nope-R', 'ws'), outside: '', sink: '', remote: null, canary: 'CANARY-x', fixture: {}, remote_error: null },
    ws: join(REAL_CLAUDE_DIR, 'nope-R', 'ws'), metadata: { attempt_id: 'att', created_at: '2026-01-01T00:00:00Z', profile: null }, external: {},
  };
  const ev = buildReadinessEvidence(bad, { createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(ev.validation_result, 'FAIL');
  assert.equal(readinessState(ev), 'REPO_PREP_FAILED');
});

// ---- F3: persisted readiness evidence must not embed the local home path / username ----
test('readiness evidence redacts the local home directory from embedded paths', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), OPTS());
    const ev = buildReadinessEvidence(env);
    const serialized = JSON.stringify(ev);
    const home = homedir();
    if (home) assert.ok(!serialized.includes(home), 'evidence must not contain the raw home path');
    // real_claude_not_target detail is home-redacted to ~\.claude (structure retained for diagnosis).
    const rc = ev.checks.find((c) => c.check === 'real_claude_not_target')!;
    assert.match(rc.detail, /~[\\/]?\.claude|REAL_CLAUDE_DIR=~/);
  } finally { t.cleanup(); }
});

// ---- F4: injected clock yields deterministic evidence timestamps ----
test('an injected clock produces a deterministic created_at', () => {
  const t = tempDir('environ');
  try {
    const env = provisionBenchEnv(join(t.dir, 'e'), { attemptId: 'att', envId: 'env', clock: () => '2026-02-02T02:02:02Z' });
    assert.equal(env.metadata.created_at, '2026-02-02T02:02:02Z');
    const ev = buildReadinessEvidence(env, { clock: () => '2026-03-03T03:03:03Z' });
    assert.equal(ev.created_at, '2026-03-03T03:03:03Z');
    // explicit createdAt still wins over the clock.
    assert.equal(buildReadinessEvidence(env, { createdAt: '2026-04-04T04:04:04Z', clock: () => 'X' }).created_at, '2026-04-04T04:04:04Z');
  } finally { t.cleanup(); }
});
