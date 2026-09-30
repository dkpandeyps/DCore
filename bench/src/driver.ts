// Session driver (methodology §4.1): headless stream-json, one user message per turn, wait for each
// `result` event before the next turn, harness actions between turns, per-line receive timing.
// Two executable kinds, recorded as provenance on every transcript:
//   - claude_code: the real Claude Code CLI. Refused unless the owner decisions required by
//     PHASE-3-EXIT-CRITERIA §4 item 8 are recorded as decided (guard.ts).
//   - test_double: a fake executable used by harness tests. Its output is synthetic and can never be
//     reported as Run A evidence (store.ts / report.ts enforce this).
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { assertIsolatedConfigDir, checkRunAuthorization, RunNotAuthorizedError } from './guard.ts';

export type ExecutableSpec =
  | { kind: 'claude_code'; path: string }
  | { kind: 'test_double'; path: string; pre_args?: string[] };

export interface TurnSpec { prompt: string; before?: () => Promise<void> | void }

export interface DriverOptions {
  executable: ExecutableSpec;
  args: string[];
  cwd: string;
  configDir: string;
  turns: TurnSpec[];
  timeoutMs: number;
  extraEnv?: Record<string, string>;
  authorize?: typeof checkRunAuthorization; // injectable for tests of the refusal path
}

export interface TranscriptLine { seq: number; rx_ms: number; raw: string; json: any | null; parse_error?: string }

export interface SessionTranscript {
  provenance: 'claude_code' | 'test_double';
  executable_path: string;
  args: string[];
  started_at: string;
  ended_at: string;
  wall_ms: number;
  exit_code: number | null;
  signal: string | null;
  timed_out: boolean;
  process_error: string | null;   // spawn failure etc. (a harness/process failure, not a benchmark outcome)
  turns_sent: number;
  results_seen: number;
  lines: TranscriptLine[];
  stdout_raw: string;
  stderr: string;
}

// Environment passed to the session: a fixed allowlist of OS variables plus the isolated config dir.
const ENV_ALLOW = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'COMSPEC', 'TEMP', 'TMP',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'HOME', 'LANG'];

export function sessionEnv(configDir: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ENV_ALLOW) if (process.env[k] !== undefined) env[k] = process.env[k]!;
  return { ...env, ...extra, CLAUDE_CONFIG_DIR: configDir };
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
}

export async function runSession(o: DriverOptions): Promise<SessionTranscript> {
  // Run-A execution gate for the real CLI (unchanged). The isolation guard runs inside spawnSession.
  if (o.executable.kind === 'claude_code') {
    const auth = (o.authorize ?? checkRunAuthorization)();
    if (!auth.authorized) throw new RunNotAuthorizedError(auth.missing);
  }
  return spawnSession(o);
}

// Gate-FREE spawn+capture core. It always enforces config-dir isolation, but performs NO authorization check:
// callers are responsible for their own gate. runSession() adds the Run-A gate; the TS-02 runner (src/ts02.ts)
// adds its own approve_enable_real_sessions gate. Do not call this directly for Run-A work.
export async function spawnSession(o: DriverOptions): Promise<SessionTranscript> {
  assertIsolatedConfigDir(o.configDir);
  const cmd = o.executable.path;
  const args = o.executable.kind === 'test_double' ? [...(o.executable.pre_args ?? []), ...o.args] : o.args;
  const t0 = performance.now();
  const started_at = new Date().toISOString();
  const lines: TranscriptLine[] = [];
  let stdout_raw = '', stderr = '', buf = '', seq = 0, turnsSent = 0, results = 0;
  let timedOut = false, processError: string | null = null;
  const pending = [...o.turns];

  return await new Promise<SessionTranscript>((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: o.cwd, env: sessionEnv(o.configDir, o.extraEnv), windowsHide: true, detached: process.platform !== 'win32' });
    const finish = (code: number | null, signal: string | null) => {
      clearTimeout(timer);
      if (buf.length) pushLine(buf);
      resolvePromise({
        provenance: o.executable.kind, executable_path: cmd, args,
        started_at, ended_at: new Date().toISOString(), wall_ms: Math.round(performance.now() - t0),
        exit_code: code, signal, timed_out: timedOut, process_error: processError,
        turns_sent: turnsSent, results_seen: results, lines, stdout_raw, stderr,
      });
    };
    const pushLine = (raw: string) => {
      const rx = Math.round(performance.now() - t0);
      const l: TranscriptLine = { seq: seq++, rx_ms: rx, raw, json: null };
      if (raw.trim() === '') return;
      try { l.json = JSON.parse(raw); } catch (e) { l.parse_error = String((e as Error).message); }
      lines.push(l);
      if (l.json?.type === 'result') { results++; void next(); }
    };
    const next = async () => {
      const t = pending.shift();
      if (!t) { child.stdin.end(); return; }
      try { if (t.before) await t.before(); } catch (e) { processError = `harness action failed: ${(e as Error).message}`; child.stdin.end(); return; }
      turnsSent++;
      child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: t.prompt } }) + '\n');
    };
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, o.timeoutMs);
    child.on('error', (e) => { processError = `spawn failed: ${e.message}`; });
    child.stdin.on('error', () => { /* child exited before reading stdin */ });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout_raw += d; buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); pushLine(line); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => { stderr += d; });
    child.on('close', (code, signal) => finish(code, signal));
    void next();
  });
}
