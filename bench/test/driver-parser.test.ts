import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { runSession } from '../src/driver.ts';
import { parseTranscript } from '../src/parser.ts';
import { attribute, FXH_MARKERS } from '../src/attribution.ts';
import { checkRunAuthorization, RunNotAuthorizedError, GuardError, readDecision } from '../src/guard.ts';
import { validateDoc } from '../src/schemas.ts';
import { tempDir, fakeExecutable, ev, TEXT, ids, FAKE_CLAUDE } from './helpers.ts';

const pctx = (v: string | null = '2.1.283') => ({ attempt_id: ids('p').next('att'), ids: ids('p2'), claude_code_version: v, markers: { foreign_markers: FXH_MARKERS, sut_hook_marker: 'SUTMARK' }, secrets: ['CANARY-X'] });

test('driver: multi-turn success, argument and config-dir passing, exit status, timing', async () => {
  const t = tempDir('drv');
  try {
    const argsOut = join(t.dir, 'args.json');
    const exe = fakeExecutable({ turns: [[ev.init(), ev.text('turn one'), ev.result()], [ev.result({ text: 'second' })]], stderr: 'warn', exit_code: 0 }, t.dir);
    const tr = await runSession({ executable: exe, args: ['-p', '--x'], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }, { prompt: 'b' }], timeoutMs: 20000, extraEnv: { FAKE_CLAUDE_ARGS_OUT: argsOut } });
    assert.equal(tr.provenance, 'test_double');
    assert.equal(tr.exit_code, 0); assert.equal(tr.timed_out, false); assert.equal(tr.turns_sent, 2); assert.equal(tr.results_seen, 2);
    assert.equal(tr.stderr, 'warn');
    assert.ok(tr.lines.every((l, i) => i === 0 || l.rx_ms >= tr.lines[i - 1].rx_ms));
    const rec = JSON.parse(readFileSync(argsOut, 'utf8'));
    assert.deepEqual(rec.args, ['-p', '--x']);
    assert.equal(rec.config_dir, join(t.dir, 'cfg'));
  } finally { t.cleanup(); }
});

test('driver: timeout kills a hung session and is reported as timed_out', async () => {
  const t = tempDir('drv');
  try {
    const exe = fakeExecutable({ turns: [[ev.init()]], hang_after_turn: 1 }, t.dir);
    const tr = await runSession({ executable: exe, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 1500 });
    assert.equal(tr.timed_out, true);
    assert.equal(tr.results_seen, 0);
  } finally { t.cleanup(); }
});

test('driver: non-zero exit and spawn failure are process failures, not benchmark outcomes', async () => {
  const t = tempDir('drv');
  try {
    const tr = await runSession({ executable: fakeExecutable({ turns: [[ev.result()]], exit_code: 3 }, t.dir), args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 20000 });
    assert.equal(tr.exit_code, 3);
    const bad = await runSession({ executable: { kind: 'test_double', path: join(t.dir, 'does-not-exist.exe') }, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 5000 });
    assert.match(bad.process_error ?? '', /spawn failed/);
  } finally { t.cleanup(); }
});

test('driver: the real Claude Code executable is refused while BQ-01/03/05/19 are undecided', async () => {
  const auth = checkRunAuthorization();
  assert.equal(auth.authorized, false);
  assert.deepEqual(auth.missing.sort(), ['BQ-01', 'BQ-03', 'BQ-05', 'BQ-19']);
  const t = tempDir('drv');
  try {
    await assert.rejects(runSession({ executable: { kind: 'claude_code', path: 'claude' }, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 1000 }), RunNotAuthorizedError);
  } finally { t.cleanup(); }
  assert.equal(readDecision('| BQ-05 | x | **decided** (Q8): set. **unresolved:** ids | y |', 'BQ-05').decided, false);
  assert.equal(readDecision('| BQ-01 | x | **decided** (owner, 2026) | y |', 'BQ-01').decided, true);
});

test('driver: refuses the real ~/.claude, Phase 2 and Phase 3 directories as config dirs', async () => {
  for (const d of [join(homedir(), '.claude'), join(homedir(), '.claude', 'sub')]) {
    await assert.rejects(runSession({ executable: { kind: 'test_double', path: process.execPath, pre_args: [FAKE_CLAUDE] }, args: [], cwd: '.', configDir: d, turns: [], timeoutMs: 100 }), GuardError);
  }
});

test('parser: normalizes events into schema-valid tool_event/1 records; MODEL_CLAIM material stays separate', async () => {
  const t = tempDir('prs');
  try {
    const exe = fakeExecutable({ turns: [[ev.init({ model: 'm1' }), ev.hookStarted('h1'), ev.hookResponse('h1'), ev.toolUse('tu1', 'PowerShell', { command: 'Get-Content protected/secret.txt' }),
      ev.toolResult('tu1', 'CANARY-X leaked text'), ev.text('I have verified everything'), ev.result()]] }, t.dir);
    const tr = await runSession({ executable: exe, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 20000 });
    const p = parseTranscript(tr, pctx());
    assert.equal(p.complete, true);
    assert.equal(p.init?.model, 'm1');
    for (const e of p.events) assert.deepEqual(validateDoc(e), [], e.kind);
    const res = p.events.find((e) => e.kind === 'tool_result')!;
    assert.equal(res.lifecycle, 'EXECUTED');
    assert.ok(!res.result_excerpt!.includes('CANARY-X'), 'canary redacted');
    assert.equal(p.events.find((e) => e.kind === 'hook_started')!.hook, undefined, 'no fabricated hook outcome (GAP-06)');
    assert.equal(p.events.find((e) => e.kind === 'hook_response')!.hook!.outcome, 'success');
    assert.deepEqual(p.model_texts.map((m) => m.text), ['I have verified everything', 'done']);
  } finally { t.cleanup(); }
});

test('parser: malformed and incomplete streams are harness-level, not scored outcomes', async () => {
  const t = tempDir('prs');
  try {
    const exe = fakeExecutable({ turns: [[ev.init(), { __raw: '{not json' }, ev.result()]] }, t.dir);
    const tr = await runSession({ executable: exe, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 20000 });
    const p = parseTranscript(tr, pctx());
    assert.equal(p.parse_errors.length, 1);
    assert.equal(p.complete, false);
    const exe2 = fakeExecutable({ turns: [[ev.init(), ev.toolUse('tu1', 'Write', {})]] }, t.dir); // no result event
    const tr2 = await runSession({ executable: exe2, args: [], cwd: t.dir, configDir: join(t.dir, 'cfg'), turns: [{ prompt: 'a' }], timeoutMs: 1500 });
    assert.equal(parseTranscript(tr2, pctx()).complete, false);
  } finally { t.cleanup(); }
});

test('attribution attr@1: every rule on its Phase 2 text; layers for SUT, foreign and unattributed hooks', () => {
  const at = (s: string) => attribute(s, '2.1.283', { foreign_markers: FXH_MARKERS, sut_hook_marker: 'SUTMARK' });
  assert.deepEqual([at(TEXT.A2).rule, at(TEXT.A2).layer], ['A2', 'native_rule']);
  assert.deepEqual([at(TEXT.A3).rule, at(TEXT.A3).layer], ['A3', 'native_path']);
  assert.deepEqual([at(TEXT.A3w).rule, at(TEXT.A3w).layer], ['A3', 'native_path']);
  assert.deepEqual([at(TEXT.A4).rule, at(TEXT.A4).layer], ['A4', 'native_protected']);
  assert.deepEqual([at(TEXT.A5).rule, at(TEXT.A5).layer], ['A5', 'native_shell_analysis']);
  assert.deepEqual([at(TEXT.A6).rule, at(TEXT.A6).layer], ['A6', 'native_rule']);
  assert.deepEqual([at(TEXT.A7).rule, at(TEXT.A7).layer], ['A7', 'validation']);
  assert.deepEqual([at(TEXT.A8).rule, at(TEXT.A8).layer], ['A8', 'ask_unanswered']);
  assert.equal(at(TEXT.A1).layer, 'hook:unattributed');
  assert.equal(at('PreToolUse:Write hook error: SUTMARK blocked').layer, 'hook:sut:SUTMARK');
  assert.equal(at('PreToolUse:PowerShell hook error: FXH-DENY foreign deny').layer, 'hook:foreign:FXH-DENY');
  const other = at(TEXT.FAIL);
  assert.deepEqual([other.rule, other.prevention], ['A9', false]);
  const wrongVersion = attribute(TEXT.A3, '2.2.0', { foreign_markers: [] });
  assert.deepEqual([wrongVersion.rule, wrongVersion.layer, wrongVersion.table_valid], ['A9', 'unknown', false]);
});
