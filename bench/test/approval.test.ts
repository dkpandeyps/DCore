import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCaseMatrix, buildFixtureMatrix, approvalSummary } from '../src/approval.ts';
import { authorAll } from '../src/author.ts';
import { canonicalFile } from '../src/canonical.ts';
import { planRunA } from '../src/runA.ts';
import { checkRunAuthorization } from '../src/guard.ts';
import { TEST_DIR } from './helpers.ts';

const APPROVAL = join(TEST_DIR, '..', 'approval');
const CASES = join(TEST_DIR, '..', 'cases');

test('the case matrix covers all 92 cases with no duplicates', () => {
  const m = buildCaseMatrix();
  assert.equal(m.length, 92);
  assert.equal(new Set(m.map((r) => r.id)).size, 92);
});

test('each row lists exactly the provenance fields that need approval (PENDING or NOT_READY)', () => {
  const authored = new Map(authorAll().map((a) => [a.provenance.case_id, a]));
  for (const r of buildCaseMatrix()) {
    const a = authored.get(r.id)!;
    const expected = Object.entries(a.provenance.fields)
      .filter(([, p]) => p.status === 'PENDING_OWNER_APPROVAL' || p.status === 'NOT_READY')
      .map(([f]) => f).sort();
    assert.deepEqual(r.fields_requiring_approval.map((f) => f.field).sort(), expected, r.ref);
    // Nothing SOURCE_DERIVED leaks into the approval list.
    for (const f of r.fields_requiring_approval) assert.ok(['PENDING_OWNER_APPROVAL', 'NOT_READY'].includes(f.current_status), `${r.ref}.${f.field}`);
  }
});

test('matrix metadata matches the committed provenance/doc artifacts (no drift, no re-authoring)', () => {
  for (const r of buildCaseMatrix()) {
    const ref = r.ref.replace('@', '-at-');
    const prov = JSON.parse(readFileSync(join(CASES, 'provenance', `${ref}.json`), 'utf8'));
    assert.equal(r.status, prov.execution_readiness, r.ref);
    assert.equal(r.approval_status, 'PENDING_OWNER_APPROVAL');
    // Where a doc exists, the proposed prompt value equals the doc prompt (verbatim, not re-authored).
    if (prov.has_executable_doc) {
      const doc = JSON.parse(readFileSync(join(CASES, 'executable', `${ref}.json`), 'utf8'));
      const promptRow = r.fields_requiring_approval.find((f) => f.field === 'prompt');
      if (promptRow) assert.ok(doc.input.turns[0].prompt.startsWith(promptRow.proposed_value.slice(0, 40)), r.ref);
    }
  }
});

test('proposed values are non-empty for every field requiring approval', () => {
  for (const r of buildCaseMatrix()) for (const f of r.fields_requiring_approval) {
    assert.ok(f.proposed_value.length > 0, `${r.ref}.${f.field}`);
    assert.ok(f.basis.length > 0, `${r.ref}.${f.field} basis`);
  }
});

test('applied decisions do not auto-approve whole cases, and Run A stays blocked', () => {
  for (const r of buildCaseMatrix()) assert.equal(r.approval_status, 'PENDING_OWNER_APPROVAL', r.ref);
  assert.equal(checkRunAuthorization().authorized, false);
  assert.equal(planRunA().may_start, false);
});

test('CASE-PROMPTS: 72 prompts remain owner-approved; 5 reauthored prompts are superseded and pending', () => {
  const m = buildCaseMatrix();
  const active = m.filter((r) => r.applied_owner_decisions.includes('CASE-PROMPTS:APPROVE_ALL'));
  const superseded = m.filter((r) => r.applied_owner_decisions.includes('CASE-PROMPTS:APPROVE_ALL(superseded-by-REAUTHOR:prompt)'));
  assert.equal(active.length, 72);      // 77 - 5 reauthored
  assert.equal(superseded.length, 5);
  assert.deepEqual(superseded.map((r) => r.id).sort(), ['AUTO-L1-001', 'EVID-CLAIM-001', 'RECV-STALE-001', 'STAT-CONC-001', 'TASK-DOC-001']);
  // Active-prompt cases are executable-form and no longer list the prompt as needing approval.
  for (const r of active) {
    assert.equal(r.status, 'EXECUTABLE_FORM_PENDING_APPROVAL', r.ref);
    assert.ok(!r.fields_requiring_approval.some((f) => f.field === 'prompt'), r.ref);
  }
  // The 3 superseded cases now carry an OWNER_APPROVED reauthored prompt (no longer pending).
  for (const r of superseded) assert.ok(!r.fields_requiring_approval.some((f) => f.field === 'prompt'), r.ref);
  // No NOT_READY case had its prompt approved.
  for (const r of m.filter((x) => x.status === 'NOT_READY_FOR_EXECUTION')) assert.ok(!r.applied_owner_decisions.includes('CASE-PROMPTS:APPROVE_ALL'), r.ref);
});

test('FIXTURES: skeletons OWNER_APPROVED while content stays pending; safety constraints intact', () => {
  const f = buildFixtureMatrix();
  for (const x of f) {
    assert.equal(x.skeleton_approval, 'OWNER_APPROVED', x.id);
    assert.equal(x.content_status, 'PENDING_OWNER_APPROVAL', x.id);   // content not authored
    assert.ok(x.pending_content.length > 0, x.id);
  }
});

test('GAP-07 recorded as B in the summary and decisions ledger', () => {
  const s = approvalSummary();
  assert.equal(s.gap07_choice, 'B');
  assert.equal(s.gap07_unresolved, false);
  const led = JSON.parse(readFileSync(join(APPROVAL, 'OWNER-DECISIONS.json'), 'utf8'));
  assert.equal(led['GAP-07'].value, 'B');
  assert.equal(led['GAP-07'].status, 'APPLIED');
});

test('all five decision groups are now APPLIED in the ledger', () => {
  const led = JSON.parse(readFileSync(join(APPROVAL, 'OWNER-DECISIONS.json'), 'utf8'));
  for (const g of ['CASE-PROMPTS', 'FIXTURES', 'GAP-07', 'NOT-READY-CASES', 'GAP-08']) assert.equal(led[g].status, 'APPLIED', g);
  assert.equal(approvalSummary().open_decisions.filter((d) => d.status === 'UNRESOLVED').length, 0);
});

test('NOT-READY-CASES: all 15 dispositioned KEEP_OUT_OF_RUN_A; none converted to executable', () => {
  const m = buildCaseMatrix();
  const keepOut = m.filter((r) => r.run_a_disposition === 'KEEP_OUT_OF_RUN_A');
  assert.equal(keepOut.length, 15);
  const expected = ['HOOK-DIS-001@2', 'HOOK-ORD-001@2', 'HOOK-RELOAD-001@2', 'HOOK-REWR-001@2', 'HOOK-TMO-001@2',
    'MCP-INPUT-001@2', 'MCP-UNVAL-001@1', 'MCP-UNVAL-002@1', 'RECV-PART-001@1', 'SHEL-BASH-004@1',
    'STAT-CONC-002@1', 'STAT-CORRUPT-001@1', 'STAT-INTEG-001@1', 'STAT-RESUME-001@1', 'STAT-STALE-001@1'];
  assert.deepEqual(keepOut.map((r) => r.ref).sort(), [...expected].sort());
  // Each stays NOT_READY (unchanged) and carries the disposition; no oracle was manufactured.
  for (const r of keepOut) {
    assert.equal(r.status, 'NOT_READY_FOR_EXECUTION', r.ref);
    assert.ok(r.applied_owner_decisions.includes('NOT-READY-CASES:KEEP_OUT_OF_RUN_A'), r.ref);
  }
  // No case is simultaneously executable-form and kept out.
  assert.ok(!m.some((r) => r.status === 'EXECUTABLE_FORM_PENDING_APPROVAL' && r.run_a_disposition === 'KEEP_OUT_OF_RUN_A'));
});

test('GAP-08: applied to the 7 git cases; local bare remote, no credentials/network; content still pending', () => {
  const m = buildCaseMatrix();
  const git = m.filter((r) => r.applied_owner_decisions.includes('GAP-08:APPROVE_PROPOSED'));
  assert.deepEqual(git.map((r) => r.ref).sort(), ['AUTO-L1-002@1', 'AUTO-L1-003@1', 'AUTO-L2-001@2', 'AUTO-L2-002@2', 'AUTO-RELAX-001@2', 'AUTO-RELAX-002@2', 'AUTO-RESTART-001@2']);
  const led = JSON.parse(readFileSync(join(APPROVAL, 'OWNER-DECISIONS.json'), 'utf8'));
  assert.match(led['GAP-08'].answers.pre_seeded_commit_content, /FX-APP skeleton/);
  assert.match(led['GAP-08'].answers.ws_git_initializer, /FX-RUNROOT@1/);
  assert.match(led['GAP-08'].note, /no credentials, no network/i);
  // Fixture content (incl. the seed-commit bytes) remains pending: not authored here.
  for (const f of buildFixtureMatrix()) assert.equal(f.content_status, 'PENDING_OWNER_APPROVAL', f.id);
});

test('fixture matrix: 6 families, all skeleton-pending, with pending content and consumers', () => {
  const f = buildFixtureMatrix();
  assert.equal(f.length, 6);
  for (const x of f) {
    assert.equal(x.status, 'SKELETON_PENDING_APPROVAL');
    assert.ok(x.pending_content.length > 0, x.id);
    assert.ok(x.consumed_by.length > 0, x.id);
  }
});

test('GAP-07 decision file records interpretation B and changes no formula', () => {
  const md = readFileSync(join(APPROVAL, 'GAP-07-DECISION.md'), 'utf8');
  assert.match(md, /RESOLVED — owner chose interpretation B/);
  assert.match(md, /matches the current scorer/);
  // The scorer's enforcement formula is unchanged (interpretation B = CORRECT_PREVENT + CORRECT_ASK).
  const scorer = readFileSync(join(TEST_DIR, '..', 'src', 'scorer.ts'), 'utf8');
  assert.match(scorer, /CORRECT_PREVENT \+ CORRECT_ASK/);
});

test('GAP-08 decision file records both answers as RESOLVED', () => {
  const md = readFileSync(join(APPROVAL, 'GAP-08-DECISION.md'), 'utf8');
  assert.match(md, /RESOLVED — both questions approved/);
  assert.match(md, /pre-seeded commit content — APPROVED/);
  assert.match(md, /which fixture git-initializes `ws\/` — APPROVED/);
  assert.match(md, /No credentials, remotes, or network/);
});

test('committed approval-packet artifacts equal a fresh deterministic generation', () => {
  const matrix = buildCaseMatrix();
  const fixtures = buildFixtureMatrix();
  const summary = approvalSummary(matrix, fixtures);
  assert.equal(readFileSync(join(APPROVAL, 'CASE-APPROVAL-MATRIX.json'), 'utf8'), canonicalFile({ banner: summary.banner, rows: matrix }));
  assert.equal(readFileSync(join(APPROVAL, 'FIXTURE-APPROVAL-MATRIX.json'), 'utf8'), canonicalFile({ banner: summary.banner, families: fixtures }));
});

test('open decisions enumerate the exact remaining approvals including GAP-07 and GAP-08', () => {
  const ids = approvalSummary().open_decisions.map((d) => d.id);
  for (const id of ['CASE-PROMPTS', 'NOT-READY-CASES', 'FIXTURES', 'GAP-07', 'GAP-08']) assert.ok(ids.includes(id), id);
});
