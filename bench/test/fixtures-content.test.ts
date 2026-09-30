import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_CONTENT_PROPOSAL, TARGET_FIELD_PROPOSALS } from '../src/fixtures-content.ts';
import { authorAll } from '../src/author.ts';
import { canonicalFile } from '../src/canonical.ts';
import { planRunA } from '../src/runA.ts';
import { TEST_DIR } from './helpers.ts';

const PROP = join(TEST_DIR, '..', 'proposal');

test('proposal covers all six fixture families; only the 4 owner-approved items are OWNER_APPROVED, rest PENDING', () => {
  const fams = new Set(FIXTURE_CONTENT_PROPOSAL.map((i) => i.family));
  assert.deepEqual([...fams].sort(), ['FX-AGENTS@1', 'FX-APP@1', 'FX-INJECT@1', 'FX-MCP@1', 'FX-PKG@1', 'FX-SINK@1']);
  const approvedPaths = new Set(FIXTURE_CONTENT_PROPOSAL.filter((i) => i.status === 'OWNER_APPROVED').map((i) => i.path));
  assert.deepEqual([...approvedPaths].sort(), [
    'ws/app/README.md',
    'ws/app/src/ (empty directory provision, .gitkeep-style marker)',
    'ws/app/src/auto-l1.txt',
    'ws/app/src/recv-stale.txt',
  ]);
  for (const it of FIXTURE_CONTENT_PROPOSAL) {
    assert.ok(['PENDING_OWNER_APPROVAL', 'OWNER_APPROVED'].includes(it.status), it.path);
    assert.equal(it.approval_required, true, it.path);
  }
});

test('the three target fields are proposed with concrete FX-APP content and not weakened', () => {
  const t = new Map(TARGET_FIELD_PROPOSALS.map((x) => [x.case, x]));
  assert.match(t.get('AUTO-L1-001@1')!.proposed_on_approval, /file_content_equals:ws\/app\/src\/auto-l1\.txt/);
  assert.match(t.get('TASK-DOC-001@1')!.proposed_on_approval, /file_content_equals:ws\/app\/README\.md/);
  assert.match(t.get('RECV-STALE-001@1')!.proposed_on_approval, /file_content_equals:ws\/app\/src\/recv-stale\.txt/);
  // Each has concrete seed+expected bytes in the FX-APP items.
  for (const p of ['ws/app/src/auto-l1.txt', 'ws/app/README.md', 'ws/app/src/recv-stale.txt']) {
    const it = FIXTURE_CONTENT_PROPOSAL.find((i) => i.path === p)!;
    assert.equal(it.kind, 'both');
    assert.ok((it.content_seed?.length ?? 0) > 0 && (it.content_expected?.length ?? 0) > 0, p);
  }
});

test('the three target expected_result fields are now OWNER_APPROVED (byte-exact file_content_equals)', () => {
  const g = (id: string) => authorAll().find((a) => a.provenance.case_id === id)!;
  const want: Record<string, string> = {
    'AUTO-L1-001': 'file_content_equals:ws/app/src/auto-l1.txt',
    'RECV-STALE-001': 'file_content_equals:ws/app/src/recv-stale.txt',
    'TASK-DOC-001': 'file_content_equals:ws/app/README.md',
  };
  for (const id of Object.keys(want)) {
    const a = g(id);
    assert.equal(a.provenance.fields['expected_result'].status, 'OWNER_APPROVED', id);
    assert.deepEqual(a.doc!.expected_result.map((x: any) => `${x.kind}:${x.target}`), [want[id]], id);
    // Prompt is also OWNER_APPROVED (reauthored).
    assert.equal(a.provenance.fields['prompt'].status, 'OWNER_APPROVED', `${id} prompt`);
  }
});

test('SUBA-DIS/TOOL absence constraint is recorded and STAT-CONC is not touched', () => {
  const abs = FIXTURE_CONTENT_PROPOSAL.find((i) => i.kind === 'absence_constraint')!;
  assert.match(abs.spec!, /MUST NOT be pre-created/);
  assert.ok(abs.consumers.includes('SUBA-DIS-001@2') && abs.consumers.includes('SUBA-TOOL-001@2'));
  // STAT-CONC-001 is not part of this proposal (deferred separately).
  assert.ok(!FIXTURE_CONTENT_PROPOSAL.some((i) => i.consumers.includes('STAT-CONC-001@1')));
});

test('committed proposal artifact equals a fresh deterministic generation', () => {
  const banner = 'FIXTURE-CONTENT PROPOSAL — PROPOSED — NOT APPROVED FOR EXECUTION. No bytes materialized; no field changed; nothing approved.';
  assert.equal(readFileSync(join(PROP, 'FIXTURE-CONTENT-PROPOSAL.json'), 'utf8'), canonicalFile({ banner, target_fields: TARGET_FIELD_PROPOSALS, items: FIXTURE_CONTENT_PROPOSAL }));
});

test('the proposal opens no execution path', () => {
  assert.equal(planRunA().may_start, false);
});
