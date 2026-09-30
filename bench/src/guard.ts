// Safety and authorization guards for the harness.
//  1. Real-configuration guard (methodology §3.2, VG-05): the harness never uses or writes the real
//     ~/.claude directory, and it records the real settings.json hash before/after (read-only).
//  2. Run authorization (PHASE-3-EXIT-CRITERIA §4 item 8): Run A — and any real Claude Code session,
//     including calibration probes — may start only after BQ-01 (budget), BQ-03 (k) and BQ-19 (auth)
//     are decided in the owner decision register. BQ-05's exact pinned model ids are also required to
//     request a model (VG-02). The harness reads the register; it never decides these itself.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { sha256 } from './canonical.ts';
import { REPO_ROOT } from './catalog.ts';

export const REAL_CLAUDE_DIR = join(homedir(), '.claude');
export const EXIT_CRITERIA_PATH = join(REPO_ROOT, 'benchmark-design', 'PHASE-3-EXIT-CRITERIA.md');

function canon(p: string): string {
  const abs = resolve(p);
  let real = abs;
  try { real = realpathSync.native(abs); } catch { /* not yet created */ }
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(canon(parent), canon(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export class GuardError extends Error {}

// Protected locations the harness must never use as a session config directory or write target.
export function protectedRoots(): string[] {
  return [
    REAL_CLAUDE_DIR,
    join(REPO_ROOT, 'platform-validation'),   // Phase 2 frozen records and scratch
    join(REPO_ROOT, 'benchmark-design'),      // Phase 3 signed-off documents
  ];
}

export function assertWritableHarnessPath(p: string): void {
  for (const root of protectedRoots()) {
    if (isInside(p, root) || isInside(root, p)) throw new GuardError(`refusing harness path ${p}: overlaps protected location ${root}`);
  }
}

export function assertIsolatedConfigDir(dir: string): void {
  assertWritableHarnessPath(dir);
  if (canon(dir) === canon(homedir())) throw new GuardError('refusing the home directory as a config directory');
}

// Read-only hash of the real user settings (VG-05). Returns null when the file does not exist.
export function realUserSettingsHash(): string | null {
  const f = join(REAL_CLAUDE_DIR, 'settings.json');
  return existsSync(f) ? sha256(readFileSync(f)) : null;
}

export interface DecisionState { id: string; state: string; decided: boolean; row: string | null }
export interface RunAuthorization { authorized: boolean; decisions: DecisionState[]; missing: string[]; source_sha256: string | null }

// BQ ids that must be decided before any real Claude Code benchmark or calibration session.
export const REQUIRED_FOR_EXECUTION = ['BQ-01', 'BQ-03', 'BQ-05', 'BQ-19'] as const;

export function readDecision(md: string, id: string): DecisionState {
  const row = md.split(/\r?\n/).find((l) => l.startsWith(`| ${id} |`)) ?? null;
  if (!row) return { id, state: 'missing', decided: false, row: null };
  const stateCell = row.split('|')[3]?.trim() ?? '';
  // BQ-05 is decided only for the model set; the exact pinned ids are explicitly "unresolved" (§1).
  const fullyDecided = /^\*\*decided/.test(stateCell) && !/\*\*unresolved/.test(stateCell) && !/\*\*deferred/.test(stateCell);
  return { id, state: stateCell.replace(/\*\*/g, '').slice(0, 120), decided: fullyDecided, row };
}

export function checkRunAuthorization(exitCriteriaPath = EXIT_CRITERIA_PATH): RunAuthorization {
  if (!existsSync(exitCriteriaPath)) {
    return { authorized: false, decisions: [], missing: [...REQUIRED_FOR_EXECUTION], source_sha256: null };
  }
  const md = readFileSync(exitCriteriaPath, 'utf8');
  const decisions = REQUIRED_FOR_EXECUTION.map((id) => readDecision(md, id));
  const missing = decisions.filter((d) => !d.decided).map((d) => d.id);
  return { authorized: missing.length === 0, decisions, missing, source_sha256: sha256(md) };
}

export class RunNotAuthorizedError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`real Claude Code execution is not authorized: owner decisions pending (${missing.join(', ')}); PHASE-3-EXIT-CRITERIA §4 item 8`);
    this.missing = missing;
  }
}

export function isInsideRepo(p: string): boolean { return isInside(p, REPO_ROOT); }
export const PATH_SEP = sep;
