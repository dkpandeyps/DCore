// Deterministic result persistence. Layout (per run):
//   <store>/<run_id>/ORIGIN.json            provenance marker, written once, never changed
//   <store>/<run_id>/run.json               aebs.run/1
//   <store>/<run_id>/profile.json           aebs.profile/2
//   <store>/<run_id>/<kind>/<id>.json       schema-validated records (attempts, tool_events, ...)
//   <store>/<run_id>/artifacts/<name>       raw artifacts (stream, rx timing), redacted before storage
//   <store>/<run_id>/manifest.json          sha256 of every file above (sorted)
// Every schema record is validated before it is written. Files are canonical JSON (sorted keys).
// The artifact retention period, storage location and access are unresolved (BQ-06): the store root is
// always an explicit, caller-supplied path, and nothing is retained or uploaded anywhere else.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { canonicalFile, sha256 } from './canonical.ts';
import { assertValid } from './schemas.ts';
import { assertWritableHarnessPath } from './guard.ts';

export type Origin = 'SYNTHETIC_TEST_FIXTURE' | 'RUN_A';

export interface OriginRecord {
  origin: Origin;
  statement: string;
  provenance: 'test_double' | 'claude_code';
  authorization?: { authorized: boolean; source_sha256: string | null };
}

export const SYNTHETIC_STATEMENT = 'SYNTHETIC TEST FIXTURE DATA produced with a test double. NOT Run A evidence. NOT a benchmark result.';

export class StoreError extends Error {}

export class RunStore {
  readonly dir: string;
  constructor(storeRoot: string, runId: string, origin: OriginRecord) {
    assertWritableHarnessPath(storeRoot);
    if (origin.origin === 'RUN_A' && (origin.provenance !== 'claude_code' || !origin.authorization?.authorized)) {
      throw new StoreError('a RUN_A store requires claude_code provenance and a recorded owner authorization');
    }
    if (origin.origin === 'SYNTHETIC_TEST_FIXTURE' && origin.provenance !== 'test_double') throw new StoreError('synthetic origin requires test_double provenance');
    this.dir = join(storeRoot, runId);
    const o = join(this.dir, 'ORIGIN.json');
    if (existsSync(o)) {
      const prev = JSON.parse(readFileSync(o, 'utf8')) as OriginRecord;
      if (prev.origin !== origin.origin) throw new StoreError(`run ${runId} already has origin ${prev.origin}; origin can never change`);
    } else {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(o, canonicalFile(origin));
    }
  }

  origin(): OriginRecord { return JSON.parse(readFileSync(join(this.dir, 'ORIGIN.json'), 'utf8')); }

  // A synthetic store only accepts transcripts from a test double, and vice versa.
  assertProvenance(p: 'test_double' | 'claude_code'): void {
    if (this.origin().provenance !== p) throw new StoreError(`transcript provenance ${p} does not match store provenance ${this.origin().provenance}`);
  }

  put(kind: string, fileId: string, doc: Record<string, unknown>): string {
    assertValid(doc);
    const d = join(this.dir, kind);
    mkdirSync(d, { recursive: true });
    const f = join(d, `${fileId}.json`);
    writeFileSync(f, canonicalFile(doc));
    return f;
  }

  putTop(name: 'run' | 'profile', doc: Record<string, unknown>): void {
    assertValid(doc);
    writeFileSync(join(this.dir, `${name}.json`), canonicalFile(doc));
  }

  // Non-schema harness outputs (e.g. METRIC_ONLY measurements, GAP-02) are kept apart from schema records.
  putHarnessNote(name: string, value: unknown): void {
    const d = join(this.dir, 'harness');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `${name}.json`), canonicalFile(value));
  }

  putArtifact(name: string, content: string): string {
    const d = join(this.dir, 'artifacts');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, name), content);
    return sha256(content);
  }

  list(kind: string): Record<string, any>[] {
    const d = join(this.dir, kind);
    if (!existsSync(d)) return [];
    return readdirSync(d).sort().map((f) => JSON.parse(readFileSync(join(d, f), 'utf8')));
  }

  readTop(name: 'run' | 'profile'): Record<string, any> | null {
    const f = join(this.dir, `${name}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }

  readHarnessNotes(): Record<string, any> {
    const d = join(this.dir, 'harness');
    if (!existsSync(d)) return {};
    return Object.fromEntries(readdirSync(d).sort().map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(d, f), 'utf8'))]));
  }

  writeManifest(): Record<string, string> {
    const files: Record<string, string> = {};
    const walk = (d: string) => {
      for (const n of readdirSync(d).sort()) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n !== 'manifest.json') files[relative(this.dir, p).replace(/\\/g, '/')] = sha256(readFileSync(p));
      }
    };
    walk(this.dir);
    writeFileSync(join(this.dir, 'manifest.json'), canonicalFile(files));
    return files;
  }
}
