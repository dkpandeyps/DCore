// Phase 4.5 — standalone TS-02 authenticated-session evidence runner.
//
// SEPARATE from runA.ts and NOT gated by Run-A authorization. It is gated by the recorded segmented owner
// decision `approve_enable_real_sessions` (register APPROVE-ENABLE-REAL-SESSIONS) and, for a REAL Claude run,
// by an explicit operator confirmation (a function flag AND an env token) plus a pinned-CLI-identity check.
// It never resolves TS-05/07/11, never authorizes Run A, and never touches BQ/GAP decisions or the gate.
//
// Real Claude is invoked ONLY through the `claude_code` executable kind with explicit operator confirmation.
// Unit tests use a `test_double` and never invoke the real CLI. A synthetic (test_double) transcript is
// schema-valid but is NEVER accepted as real TS-02 evidence (authenticated: 'synthetic_test_fixture').
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSession, type ExecutableSpec, type SessionTranscript } from './driver.ts';
import { assertIsolatedConfigDir } from './guard.ts';
import { sha256, canonicalJson } from './canonical.ts';
import { assertValid } from './schemas.ts';
import { PHASE4_DECISIONS } from './phase4-register.ts';
import type { IdSource } from './ids.ts';

export class Ts02Error extends Error {}

// Pinned CLI identity (owner-confirmed 2026-09-28). Only version + hash are pinned in source; the executable
// PATH is supplied at call time and verified by hashing (so no local/home path is embedded here). No substitution.
export const PINNED_CLI = {
  version: '2.1.283',
  sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A',
} as const;

// Gate: the recorded segmented approval (injectable for tests).
export function enableRealSessionsApproved(register: typeof PHASE4_DECISIONS = PHASE4_DECISIONS): boolean {
  const v = register['APPROVE-ENABLE-REAL-SESSIONS']?.value as Record<string, unknown> | undefined;
  return !!v && v.owner_approval === 'APPROVED' && v.authorizes_real_session_for_ts02_evidence === true;
}

function redactHome(s: string): string {
  const h = homedir();
  return h && s.includes(h) ? s.split(h).join('~') : s;
}

// Verify a supplied CLI binary against the pinned identity (read-only hash; never executes it).
// Diagnostics report the OBSERVED identity separately from the PINNED one. The observed version is never
// known here (the binary is not executed), so it is always null; `version` is the pinned version only when
// the hash matches, and null on any mismatch, so a failing binary is never labelled with the pinned version.
export interface CliIdentityPin { version: string; sha256: string }
export interface CliIdentityObserved { path: string; sha256: string | null; version: null }
export type PinnedCliCheck =
  | { ok: true; version: string; sha256: string; detail: string; pinned: CliIdentityPin; observed: CliIdentityObserved }
  | { ok: false; version: null; sha256: string; detail: string; pinned: CliIdentityPin; observed: CliIdentityObserved };

export function verifyPinnedCli(execPath: string): PinnedCliCheck {
  const pinned: CliIdentityPin = { version: PINNED_CLI.version, sha256: PINNED_CLI.sha256 };
  const where = redactHome(execPath);
  if (!existsSync(execPath)) {
    return { ok: false, version: null, sha256: '', detail: `CLI not found at ${where}`, pinned, observed: { path: where, sha256: null, version: null } };
  }
  const hash = createHash('sha256').update(readFileSync(execPath)).digest('hex').toUpperCase();
  const observed: CliIdentityObserved = { path: where, sha256: hash, version: null };
  if (hash === PINNED_CLI.sha256.toUpperCase()) return { ok: true, version: PINNED_CLI.version, sha256: hash, detail: 'matches pinned identity', pinned, observed };
  return {
    ok: false, version: null, sha256: hash, pinned, observed,
    detail: `HASH MISMATCH (no substitution): observed sha256 ${hash} at ${where} (version not determined; binary not executed); pinned ${pinned.version} sha256 ${pinned.sha256}`,
  };
}

export interface CliIdentityRecord { version: string; executable_path: string; sha256: string }

export interface BuildOpts {
  ids: IdSource;
  environmentId: string;
  configDir: string;
  cli: CliIdentityRecord;      // already-redacted-or-redactable identity; caller supplies observed values
  verifiedAt: string;
  createdAt?: string;
}

// Build the redacted, schema-valid TS-02 evidence pair from an actual session transcript. Never fabricates:
// every field is derived from the transcript/opts. auth_reference is opaque and NOT credential-derived.
export function buildAuthAttempt(transcript: SessionTranscript, o: BuildOpts): { attempt: any; transcript: any } {
  const cfgRef = redactHome(o.configDir);
  const events = transcript.lines.filter((l) => l.json).map((l) => ({
    seq: l.seq, rx_ms: l.rx_ms, type: String(l.json.type ?? 'unknown'),
    ...(l.json.subtype ? { subtype: String(l.json.subtype) } : {}),
    ...(l.json.session_id ? { session_id: String(l.json.session_id) } : {}),
    ...(l.json.model ? { model: String(l.json.model) } : {}),
  }));
  const st = assertValid({
    schema: 'aebs.session_transcript/1',
    provenance: transcript.provenance,
    executable_path: redactHome(transcript.executable_path),
    started_at: transcript.started_at, ended_at: transcript.ended_at, wall_ms: transcript.wall_ms,
    exit_code: transcript.exit_code, timed_out: transcript.timed_out,
    turns_sent: transcript.turns_sent, results_seen: transcript.results_seen, line_count: transcript.lines.length,
    events,
  });
  const attempt = assertValid({
    schema: 'aebs.auth_attempt/1',
    attempt_id: o.ids.next('att'),
    run_id: o.ids.next('run'),
    environment_id: o.environmentId,
    verified_at: o.verifiedAt,
    auth_reference: sha256([o.environmentId, cfgRef, transcript.started_at].join('|')),  // opaque, non-secret
    isolated_config_ref: cfgRef,
    isolated_config_id: sha256(cfgRef),
    cli_identity: { version: o.cli.version, executable_path: redactHome(o.cli.executable_path), sha256: o.cli.sha256 },
    provenance: transcript.provenance,
    authenticated: transcript.provenance === 'claude_code' ? 'real' : 'synthetic_test_fixture',
    session: { results_seen: transcript.results_seen, turns_sent: transcript.turns_sent, exit_code: transcript.exit_code },
    transcript_hash: sha256(canonicalJson(st)),
    created_at: o.createdAt ?? o.verifiedAt,
  });
  return { attempt, transcript: st };
}

const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|"access_token"|"refresh_token"|"api[_-]?key"|"cookie"|bearer\s+[a-z0-9]{6})/i;

// Semantic validation on top of schema validation. Rejects the failure modes the spike must catch.
export function validateTs02Evidence(attempt: any, transcript: any, opts: { expectedEnvId: string; requireReal?: boolean }): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!attempt?.run_id) errors.push('missing run_id');
  if (!attempt?.environment_id) errors.push('missing environment_id');
  else if (attempt.environment_id !== opts.expectedEnvId) errors.push(`wrong environment (${attempt.environment_id} != ${opts.expectedEnvId})`);
  if (!attempt?.verified_at) errors.push('missing verified_at');
  if (!attempt?.auth_reference) errors.push('missing auth_reference');
  const cfg = String(attempt?.isolated_config_ref ?? '').replace(/\\/g, '/').toLowerCase();
  if (cfg.includes('~/.claude') || cfg.endsWith('/.claude') || cfg === '~') errors.push('real ~/.claude as config target');
  if (!transcript || typeof transcript.results_seen !== 'number' || transcript.results_seen < 1) errors.push('missing authenticated session evidence (no result events)');
  if (opts.requireReal && attempt?.authenticated !== 'real') errors.push('synthetic transcript not accepted as TS-02 evidence');
  if (SECRET_RE.test(JSON.stringify(attempt)) || SECRET_RE.test(JSON.stringify(transcript))) errors.push('credential/secret material in persisted evidence');
  return { ok: errors.length === 0, errors };
}

export interface Ts02RunOptions {
  executable: ExecutableSpec;         // claude_code (real) or test_double (tests)
  configDir: string;                  // isolated CLAUDE_CONFIG_DIR (guard-enforced)
  environmentId: string;
  cwd: string;
  ids: IdSource;
  cliExecutablePath?: string;         // required for claude_code (pinned-identity verification)
  args?: string[];
  timeoutMs?: number;
  clock?: () => string;
  approved?: () => boolean;           // default: enableRealSessionsApproved (injectable for tests)
  confirmRealRun?: boolean;           // operator explicit confirmation for a REAL Claude invocation
}

const DEFAULT_ARGS = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];

// The gated runner. Refuses without the recorded approval. For a real Claude run it additionally requires
// confirmRealRun===true AND process.env.AEBS_TS02_CONFIRM==='1' AND a verified pinned CLI, so tests/build never
// invoke the real CLI. Returns the schema-valid evidence + validation result; it does NOT itself mark TS-02 resolved.
export async function runTs02Session(o: Ts02RunOptions): Promise<{ attempt: any; transcript: any; validation: { ok: boolean; errors: string[] }; provenance: string }> {
  if (!(o.approved ?? enableRealSessionsApproved)()) throw new Ts02Error('refused: approve_enable_real_sessions is not APPROVED');
  assertIsolatedConfigDir(o.configDir);                                    // rejects real ~/.claude / home / protected
  let cli: CliIdentityRecord;
  if (o.executable.kind === 'claude_code') {
    if (o.confirmRealRun !== true || process.env.AEBS_TS02_CONFIRM !== '1') throw new Ts02Error('refused: a real Claude invocation requires confirmRealRun=true and AEBS_TS02_CONFIRM=1');
    if (!o.cliExecutablePath) throw new Ts02Error('refused: cliExecutablePath is required to verify the pinned CLI identity');
    const v = verifyPinnedCli(o.cliExecutablePath);
    if (!v.ok) throw new Ts02Error(`refused: ${v.detail}`);
    cli = { version: v.version, executable_path: o.cliExecutablePath, sha256: v.sha256 };
  } else {
    // test_double: identity is the fake's own, clearly not the pinned CLI (authenticated becomes synthetic_test_fixture).
    cli = { version: 'test_double', executable_path: o.executable.path, sha256: createHash('sha256').update(o.executable.path).digest('hex') };
  }
  const clock = o.clock ?? (() => new Date().toISOString());
  const transcript = await spawnSession({
    executable: o.executable,
    args: o.args ?? DEFAULT_ARGS,
    cwd: o.cwd,
    configDir: o.configDir,
    turns: [{ prompt: 'Reply with the single word: authenticated' }],
    timeoutMs: o.timeoutMs ?? 60000,
  });
  const built = buildAuthAttempt(transcript, { ids: o.ids, environmentId: o.environmentId, configDir: o.configDir, cli, verifiedAt: clock(), createdAt: clock() });
  const validation = validateTs02Evidence(built.attempt, built.transcript, { expectedEnvId: o.environmentId, requireReal: o.executable.kind === 'claude_code' });
  return { ...built, validation, provenance: transcript.provenance };
}
