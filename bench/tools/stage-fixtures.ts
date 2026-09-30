// Deterministic STAGING-ONLY fixture materializer (staging phase, owner decision 2026-09-28).
//
// Consumes the OWNER_APPROVED fixture-content record (src/fixtures-authoring.ts) and emits ONLY the
// 21 byte-exact approved entries into a committed staging tree at bench/materialized/. It:
//   - writes NOTHING outside bench/materialized/ except its provenance manifest under bench/approval/;
//   - never creates ws/, R/, or /runtime/ at the repo/runtime root; never touches ~/.claude;
//   - does NOT change fixture builders, the FixtureStatus model, or any execution gate;
//   - stages ONLY entries that carry exact recorded `content` (behavior-only/deferred entries are skipped).
//
// The staging tree is an approval/materialization ARTIFACT ONLY. It is NOT a runtime fixture root and must
// never be consumed by Run A in place of the per-attempt roots built by src/fixtures.ts buildRunRoot.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, canonicalFile } from '../src/canonical.ts';
import { authoringApproved, type AuthoredEntry } from '../src/fixtures-authoring.ts';

const BENCH = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE_ROOT = join(BENCH, 'materialized');
const MANIFEST = join(BENCH, 'approval', 'FIXTURE-STAGING-MANIFEST.json');

const STAGED_ROUND = 'round 8 (staging materialization)';
const STAGED_DATE = '2026-09-28';

export interface StagedFile {
  family: string;
  approval_id: string;         // AuthoredEntry.id (approval-record identity)
  logical_path: string;        // intended path with logical roots ({CFG}/{FX}/R/ws/pkg)
  staging_relpath: string;     // path under bench/materialized/ (logical roots de-braced; never a real runtime root)
  content_sha256: string;
  bytes: number;
  staged_round: string;
  staged_date: string;
}

// Map a logical intended path to its staging relpath under bench/materialized/.
// Only removes the brace characters from logical placeholder roots ({CFG} -> CFG, {FX} -> FX);
// literal roots (ws/, R/, pkg/) are preserved verbatim. No logical root is reinterpreted as a runtime path.
export function stagingRelpath(logicalPath: string): string {
  return logicalPath.replace(/[{}]/g, '');
}

// PURE: the deterministic staging plan (no IO). Only byte-exact OWNER_APPROVED entries are included.
export function stagingPlan(): { entry: AuthoredEntry; staged: StagedFile }[] {
  const byteExact = authoringApproved().filter((e) => typeof e.content === 'string' && e.path);
  return byteExact.map((e) => {
    const content = e.content as string;
    const staging_relpath = stagingRelpath(e.path as string);
    return {
      entry: e,
      staged: {
        family: e.family,
        approval_id: e.id,
        logical_path: e.path as string,
        staging_relpath,
        content_sha256: sha256(content),
        bytes: Buffer.byteLength(content, 'utf8'),
        staged_round: STAGED_ROUND,
        staged_date: STAGED_DATE,
      },
    };
  });
}

export function stagingManifest(): string {
  const files = stagingPlan().map((p) => p.staged);
  const banner =
    'FIXTURE STAGING MANIFEST — staging artifact only (2026-09-28). ' +
    'bench/materialized/ holds byte-exact OWNER_APPROVED fixture content for review; it is NOT a runtime root and ' +
    'must never be consumed by Run A in place of per-attempt roots. 10 behavior-only entries remain deferred/unstaged.';
  return canonicalFile({ banner, staged_round: STAGED_ROUND, staged_date: STAGED_DATE, count: files.length, files });
}

function main(): void {
  const plan = stagingPlan();
  for (const { entry, staged } of plan) {
    const dest = join(STAGE_ROOT, staged.staging_relpath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.content as string);   // exact recorded bytes, verbatim
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, stagingManifest());
  console.log(`staged ${plan.length} byte-exact OWNER_APPROVED fixture files into bench/materialized/`);
  console.log(`manifest: bench/approval/FIXTURE-STAGING-MANIFEST.json`);
}

main();
