import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import {
  runTs02Session, buildAuthAttempt, validateTs02Evidence, enableRealSessionsApproved, verifyPinnedCli,
  PINNED_CLI, Ts02Error,
} from '../src/ts02.ts';
import { runSession } from '../src/driver.ts';
import { validateDoc } from '../src/schemas.ts';
import { REAL_CLAUDE_DIR, GuardError, checkRunAuthorization, RunNotAuthorizedError } from '../src/guard.ts';
import { planRunA } from '../src/runA.ts';
import { PHASE4_DECISIONS } from '../src/phase4-register.ts';
import { tempDir, fakeExecutable, ids, ev } from './helpers.ts';

// A test_double scenario that emits an init + result event for one turn (a well-formed synthetic session).
const AUTH_SCENARIO = { turns: [[ev.init({ model: 'synthetic-model' }), ev.result({ text: 'authenticated' })]] };
// A scenario with NO result event (missing authenticated-session evidence).
const NO_RESULT_SCENARIO = { turns: [[ev.text('hello, no result')]] };

function run(scenario: unknown, o: Partial<Parameters<typeof runTs02Session>[0]> = {}) {
  const t = tempDir('ts02');
  const configDir = join(t.dir, 'cfg');
  const exe = fakeExecutable(scenario, t.dir);
  return { t, promise: runTs02Session({ executable: exe, configDir, environmentId: 'PTPL-DK-BENCH-WIN-01', cwd: t.dir, ids: ids('ts02'), clock: () => '2026-01-01T00:00:00Z', ...o }) };
}

test('runner refuses when approve_enable_real_sessions is absent', async () => {
  const { t, promise } = run(AUTH_SCENARIO, { approved: () => false });
  try { await assert.rejects(promise, Ts02Error); } finally { t.cleanup(); }
});

test('runner rejects the real ~/.claude as the config dir', async () => {
  const exeDir = tempDir('ts02');
  try {
    await assert.rejects(
      runTs02Session({ executable: fakeExecutable(AUTH_SCENARIO, exeDir.dir), configDir: REAL_CLAUDE_DIR, environmentId: 'PTPL-DK-BENCH-WIN-01', cwd: exeDir.dir, ids: ids('x') }),
      GuardError,
    );
  } finally { exeDir.cleanup(); }
});

test('isolated config + test_double session produces schema-valid, redacted evidence (synthetic, not real)', async () => {
  const { t, promise } = run(AUTH_SCENARIO);
  try {
    const r = await promise;
    assert.equal(validateDoc(r.attempt).length, 0);
    assert.equal(validateDoc(r.transcript).length, 0);
    assert.equal(r.provenance, 'test_double');
    assert.equal(r.attempt.authenticated, 'synthetic_test_fixture');   // never 'real' for a double
    assert.equal(r.attempt.environment_id, 'PTPL-DK-BENCH-WIN-01');
    assert.match(r.attempt.auth_reference, /^sha256:[0-9a-f]{64}$/);
    assert.equal(r.transcript.results_seen, 1);
    // schema-valid but NOT accepted as real TS-02 evidence
    assert.equal(validateTs02Evidence(r.attempt, r.transcript, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01' }).ok, true);
    assert.equal(validateTs02Evidence(r.attempt, r.transcript, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01', requireReal: true }).ok, false);
  } finally { t.cleanup(); }
});

test('evidence carries no raw content and no credential/secret material', async () => {
  const { t, promise } = run(AUTH_SCENARIO);
  try {
    const r = await promise;
    const serialized = JSON.stringify(r.attempt) + JSON.stringify(r.transcript);
    assert.ok(!/stdout_raw|"raw"/.test(serialized), 'no raw stdout/lines persisted');
    // inject a fake secret into a copy and confirm the validator rejects it
    const tampered = { ...r.transcript, events: [...r.transcript.events, { seq: 99, rx_ms: 1, type: 'x', model: 'sk-abc123 access_token' }] };
    assert.equal(validateTs02Evidence(r.attempt, tampered, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01' }).ok, false);
  } finally { t.cleanup(); }
});

test('missing authenticated-session evidence (no result event) is rejected', async () => {
  const { t, promise } = run(NO_RESULT_SCENARIO);
  try {
    const r = await promise;
    assert.equal(r.transcript.results_seen, 0);
    const v = validateTs02Evidence(r.attempt, r.transcript, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01' });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /missing authenticated session evidence/.test(e)));
  } finally { t.cleanup(); }
});

test('validator rejects missing run_id / wrong env / real ~/.claude config target / malformed', () => {
  const good = { schema: 'aebs.auth_attempt/1', run_id: 'run_X', environment_id: 'PTPL-DK-BENCH-WIN-01', verified_at: 't', auth_reference: 'sha256:' + 'a'.repeat(64), isolated_config_ref: '~/.aebs-bench/PTPL-DK-BENCH-WIN-01/cfg' };
  const tr = { results_seen: 1 };
  assert.equal(validateTs02Evidence(good, tr, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01' }).ok, true);
  assert.ok(validateTs02Evidence({ ...good, run_id: undefined }, tr, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01' }).errors.some((e) => /run_id/.test(e)));
  assert.ok(validateTs02Evidence(good, tr, { expectedEnvId: 'OTHER' }).errors.some((e) => /wrong environment/.test(e)));
  assert.ok(validateTs02Evidence({ ...good, isolated_config_ref: '~/.claude' }, tr, { expectedEnvId: 'PTPL-DK-BENCH-WIN-01' }).errors.some((e) => /real ~\/\.claude/.test(e)));
  // malformed schema doc is rejected by the schema validator
  assert.ok(validateDoc({ schema: 'aebs.auth_attempt/1', run_id: 'run_X' }).length > 0);
});

test('a valid synthetic fixture is accepted by the schema validator (both schemas)', () => {
  const b = buildAuthAttempt(
    { provenance: 'test_double', executable_path: 'C:/x/fake.mjs', started_at: 't0', ended_at: 't1', wall_ms: 3, exit_code: 0, signal: null, timed_out: false, process_error: null, turns_sent: 1, results_seen: 1, stdout_raw: '', stderr: '', lines: [{ seq: 0, rx_ms: 1, raw: '', json: { type: 'result', subtype: 'success' } }] } as any,
    { ids: ids('fix'), environmentId: 'PTPL-DK-BENCH-WIN-01', configDir: 'C:/iso/cfg', cli: { version: 'test_double', executable_path: 'C:/x/fake.mjs', sha256: 'a'.repeat(64) }, verifiedAt: 't2' },
  );
  assert.deepEqual(validateDoc(b.attempt), []);
  assert.deepEqual(validateDoc(b.transcript), []);
});

test('a real claude_code invocation is refused without explicit operator confirmation (tests never invoke Claude)', async () => {
  const t = tempDir('ts02');
  try {
    // claude_code kind but no confirmRealRun / no env token -> refused before any spawn.
    await assert.rejects(
      runTs02Session({ executable: { kind: 'claude_code', path: 'C:/nonexistent/claude.exe' }, configDir: join(t.dir, 'cfg'), environmentId: 'PTPL-DK-BENCH-WIN-01', cwd: t.dir, ids: ids('r'), approved: () => true }),
      (e: unknown) => e instanceof Ts02Error && /confirmRealRun.*AEBS_TS02_CONFIRM/.test((e as Error).message),
    );
  } finally { t.cleanup(); }
});

test('pinned CLI verification rejects a non-matching binary; never executes it', () => {
  const t = tempDir('ts02');
  try {
    const fake = fakeExecutable({ turns: [] }, t.dir).path; // a real file, wrong hash
    const v = verifyPinnedCli(fake);
    // node.exe is not the pinned claude.exe -> mismatch
    assert.equal(v.ok, false);
    assert.match(v.detail, /MISMATCH|not found/);
    assert.equal(PINNED_CLI.version, '2.1.283');
  } finally { t.cleanup(); }
});

// Diagnostic-quality checks for the pinned-CLI mismatch path. These never execute any binary and never
// validate any Claude Code version: they only prove what a mismatch reports and that it still refuses.
const PINNED_EXPECTED = { version: '2.1.283', sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A' };

function mismatchBinary(dir: string): { path: string; sha256: string } {
  const p = join(dir, 'not-the-pinned-claude.bin');
  const bytes = Buffer.from('aebs test fixture: not a Claude Code binary\n');
  writeFileSync(p, bytes);
  return { path: p, sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase() };
}

test('the pinned CLI identity is unchanged (2.1.283 / 9DBE16…DE3A)', () => {
  assert.deepEqual({ ...PINNED_CLI }, PINNED_EXPECTED);
});

test('a mismatching binary is reported with its OBSERVED identity, separate from the PINNED identity', () => {
  const t = tempDir('ts02');
  try {
    const bin = mismatchBinary(t.dir);
    const v = verifyPinnedCli(bin.path);
    assert.equal(v.ok, false);
    assert.equal(v.version, null);                          // never labelled with the pinned version
    assert.deepEqual(v.pinned, PINNED_EXPECTED);
    assert.equal(v.observed.sha256, bin.sha256);
    assert.equal(v.observed.version, null);                 // version not determined: binary is never executed
    assert.notEqual(v.observed.sha256, v.pinned.sha256);
    assert.equal(v.sha256, bin.sha256);
    assert.match(v.detail, /HASH MISMATCH \(no substitution\)/);
    assert.ok(v.detail.includes(`observed sha256 ${bin.sha256}`));
    assert.ok(v.detail.includes(`pinned 2.1.283 sha256 ${PINNED_EXPECTED.sha256}`));
    assert.deepEqual({ ...PINNED_CLI }, PINNED_EXPECTED);  // no automatic pin update
    // a missing binary is also reported without borrowing the pinned identity
    const gone = verifyPinnedCli(join(t.dir, 'absent.exe'));
    assert.equal(gone.ok, false);
    assert.equal(gone.version, null);
    assert.equal(gone.observed.sha256, null);
    assert.deepEqual(gone.pinned, PINNED_EXPECTED);
  } finally { t.cleanup(); }
});

test('a pinned-CLI mismatch refuses before invoking Claude and produces no session/credential evidence', async () => {
  const t = tempDir('ts02');
  const prev = process.env.AEBS_TS02_CONFIRM;
  process.env.AEBS_TS02_CONFIRM = '1';                    // every other gate satisfied: only the identity check stands
  try {
    const bin = mismatchBinary(t.dir);
    const configDir = join(t.dir, 'cfg');
    const before = readdirSync(t.dir).sort();
    let result: unknown;
    await assert.rejects(
      (async () => {
        result = await runTs02Session({
          // a path that does not exist: even a wrongly-reached spawn could not run anything
          executable: { kind: 'claude_code', path: join(t.dir, 'never-spawned', 'claude.exe') },
          configDir, environmentId: 'PTPL-DK-BENCH-WIN-01', cwd: t.dir, ids: ids('mm'),
          approved: () => true, confirmRealRun: true, cliExecutablePath: bin.path,
        });
      })(),
      (e: unknown) => e instanceof Ts02Error
        && /^refused: HASH MISMATCH \(no substitution\)/.test((e as Error).message)
        && (e as Error).message.includes(`observed sha256 ${bin.sha256}`)
        && (e as Error).message.includes('pinned 2.1.283'),
    );
    assert.equal(result, undefined);                        // no attempt / transcript / validation returned
    assert.deepEqual(readdirSync(t.dir).sort(), before);    // nothing written: no config dir, no evidence files
    assert.equal(existsSync(configDir), false);
  } finally {
    if (prev === undefined) delete process.env.AEBS_TS02_CONFIRM; else process.env.AEBS_TS02_CONFIRM = prev;
    t.cleanup();
  }
});

test('the approval gate reads the recorded register decision', () => {
  assert.equal(enableRealSessionsApproved(), true); // APPROVE-ENABLE-REAL-SESSIONS is recorded APPROVED
  const noApproval = { ...PHASE4_DECISIONS, 'APPROVE-ENABLE-REAL-SESSIONS': { ...PHASE4_DECISIONS['APPROVE-ENABLE-REAL-SESSIONS'], value: { ...PHASE4_DECISIONS['APPROVE-ENABLE-REAL-SESSIONS'].value, owner_approval: 'PENDING' } } } as any;
  assert.equal(enableRealSessionsApproved(noApproval), false);
});

test('existing Run-A authorization and gate are unchanged by the TS-02 runner', async () => {
  assert.equal(checkRunAuthorization().authorized, false);
  assert.equal(planRunA().may_start, false);
  // runSession still enforces the Run-A gate for claude_code (refactor preserved the guard).
  const t = tempDir('ts02');
  try {
    await assert.rejects(
      runSession({ executable: { kind: 'claude_code', path: 'C:/nonexistent/claude.exe' }, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [], timeoutMs: 1000, authorize: () => ({ authorized: false, decisions: [], missing: ['BQ-01'], source_sha256: null }) }),
      RunNotAuthorizedError,
    );
  } finally { t.cleanup(); }
});
