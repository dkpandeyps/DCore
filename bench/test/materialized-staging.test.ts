import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256 } from '../src/canonical.ts';
import { authoringApproved, authoringReauthor, FIXTURE_AUTHORING_RECORD } from '../src/fixtures-authoring.ts';
import { stagingPlan, stagingManifest, stagingRelpath } from '../tools/stage-fixtures.ts';
import { planRunA } from '../src/runA.ts';
import { checkRunAuthorization } from '../src/guard.ts';
import { TEST_DIR } from './helpers.ts';

const BENCH = join(TEST_DIR, '..');
const STAGE_ROOT = join(BENCH, 'materialized');
const MANIFEST = join(BENCH, 'approval', 'FIXTURE-STAGING-MANIFEST.json');

function walk(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) rec(p);
      else out.push(relative(STAGE_ROOT, p).replace(/\\/g, '/'));
    }
  };
  if (existsSync(dir)) rec(dir);
  return out;
}

test('exactly the 21 byte-exact OWNER_APPROVED entries are in the staging plan', () => {
  const plan = stagingPlan();
  assert.equal(plan.length, 21);
  // Every planned entry is OWNER_APPROVED and carries exact content.
  for (const { entry } of plan) {
    assert.equal(entry.status, 'OWNER_APPROVED', entry.id);
    assert.equal(typeof entry.content, 'string', entry.id);
    assert.ok((entry.content as string).length > 0, entry.id);
  }
});

test('the 10 behavior-only/deferred entries are NOT staged', () => {
  const stagedIds = new Set(stagingPlan().map((p) => p.entry.id));
  const deferred = FIXTURE_AUTHORING_RECORD.filter((e) => typeof e.content !== 'string');
  assert.equal(deferred.length, 10);
  for (const e of deferred) assert.ok(!stagedIds.has(e.id), `${e.id} must remain unstaged`);
  // Named deferred set (sink server, 5 MCP servers, tarball, 2 hidden oracles, mcp-hostile-ref).
  assert.deepEqual(deferred.map((e) => e.id).sort(), [
    'fx-app/hidden/calc.hidden.test.mjs', 'fx-app/hidden/edit.hidden.test.mjs',
    'fx-inject/mcp-hostile-ref',
    'fx-mcp/servers/echo', 'fx-mcp/servers/fileread', 'fx-mcp/servers/hostile', 'fx-mcp/servers/malformed', 'fx-mcp/servers/send',
    'fx-pkg/tarball', 'fx-sink/server',
  ]);
});

test('every staged file on disk maps 1:1 to an OWNER_APPROVED entry with byte-exact content + matching hash', () => {
  const onDisk = walk(STAGE_ROOT);
  const plan = stagingPlan();
  assert.equal(onDisk.length, plan.length, 'staged file count == plan count');
  const byRelpath = new Map(plan.map((p) => [p.staged.staging_relpath, p]));
  for (const rel of onDisk) {
    const p = byRelpath.get(rel);
    assert.ok(p, `staged file ${rel} has no approved-entry mapping`);
    const bytes = readFileSync(join(STAGE_ROOT, rel), 'utf8');
    assert.equal(bytes, p!.entry.content, `${rel} content matches the approved bytes verbatim`);
    assert.equal(sha256(bytes), p!.staged.content_sha256, `${rel} hash matches the manifest`);
  }
  // No pending/unapproved/deferred entry produced a staged file.
  const approvedPaths = new Set(authoringApproved().filter((e) => typeof e.content === 'string').map((e) => stagingRelpath(e.path as string)));
  for (const rel of onDisk) assert.ok(approvedPaths.has(rel), `${rel} is not an OWNER_APPROVED byte-exact path`);
});

test('staging is deterministic: committed manifest equals a fresh generation', () => {
  assert.equal(readFileSync(MANIFEST, 'utf8'), stagingManifest());
});

test('logical roots are de-braced but never reinterpreted as runtime paths', () => {
  assert.equal(stagingRelpath('{CFG}/agents/x.md'), 'CFG/agents/x.md');
  assert.equal(stagingRelpath('{FX}/plugin/p.json'), 'FX/plugin/p.json');
  assert.equal(stagingRelpath('R/mcp/mcp-config.json'), 'R/mcp/mcp-config.json');
  assert.equal(stagingRelpath('ws/app/x.txt'), 'ws/app/x.txt');
  // The staging tree lives only under bench/materialized/ — no leading ws/ or R/ at repo root.
  for (const p of stagingPlan()) assert.ok(!p.staged.staging_relpath.startsWith('/'), p.staged.staging_relpath);
});

test('staging opens no execution path and no approval status changed', () => {
  assert.equal(planRunA().may_start, false);
  assert.equal(checkRunAuthorization().authorized, false);
  // No entry moved to REQUEST_REAUTHORING; approved count unchanged (31), reauthoring 0.
  assert.equal(authoringApproved().length, 31);
  assert.equal(authoringReauthor().length, 0);
});
