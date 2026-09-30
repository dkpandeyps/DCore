import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAllProposals, buildCaseProposal, isSilent, PROPOSAL_BANNER } from '../src/proposal.ts';
import { FIXTURE_SPECS } from '../src/fixtures-spec.ts';
import { reconcile, sourceSilentReport } from '../src/reconcile.ts';
import { loadCatalogIndex } from '../src/catalog.ts';
import { canonicalFile } from '../src/canonical.ts';
import { planRunA } from '../src/runA.ts';
import { checkRunAuthorization } from '../src/guard.ts';
import { TEST_DIR } from './helpers.ts';

const PROP = join(TEST_DIR, '..', 'proposal');

test('proposal has exactly the approved 92 IDs, no duplicates, no unexpected cases', () => {
  const r = reconcile();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.missing_ids, []);
  assert.deepEqual(r.unexpected_ids, []);
  assert.deepEqual(r.duplicate_ids, []);
  assert.equal(r.counts.proposal, 92);
  assert.deepEqual([r.counts.core, r.counts.sut_capability, r.counts.not_applicable, r.counts.at2], [86, 4, 2, 42]);
});

test('severity, applicability, repetition tier and category are preserved (no drift)', () => {
  const r = reconcile();
  assert.deepEqual(r.changed_severity, []);
  assert.deepEqual(r.changed_applicability, []);
  assert.deepEqual(r.changed_tier, []);
  assert.deepEqual(r.changed_category, []);
  // Positive check: a mutated proposal must be detected.
  const mutated = buildAllProposals().map((p) => p.id === 'SAFE-DEST-001' ? { ...p, applicability: 'SUT_CAPABILITY' } : p);
  assert.ok(reconcile(mutated as any).changed_applicability.length > 0);
});

test('no HG-06 anywhere; SG-01 only on the two AUTO-RELAX cases; metric-only treatment correct', () => {
  const r = reconcile();
  assert.deepEqual(r.invariant_violations, []);
  for (const p of buildAllProposals()) {
    const gates = isSilent(p.hard_gates) ? [] : p.hard_gates.value;
    assert.ok(!gates.includes('HG-06'), `${p.id} has HG-06`);
    const sg = isSilent(p.sg01) ? '' : p.sg01.value;
    if (p.id === 'AUTO-RELAX-001' || p.id === 'AUTO-RELAX-002') assert.match(sg, /APPLICABLE \(AEOS/);
    else assert.equal(sg, 'NOT_APPLICABLE', p.id);
  }
  const metric = buildAllProposals().filter((p) => p.metric_only).map((p) => p.id).sort();
  assert.deepEqual(metric, ['HOOK-LAT-001', 'SUBA-PLUG-001']);
  for (const id of metric) {
    const p = buildCaseProposal(loadCatalogIndex().entries.find((e) => e.id === id)!);
    assert.equal(p.outcome_type, 'METRIC_ONLY');
    assert.deepEqual(isSilent(p.hard_gates) ? [] : p.hard_gates.value, []);
  }
});

test('SAFE-BYP-002@2 keeps the typed expectation; unsafe execution is never accepted', () => {
  const p = buildCaseProposal(loadCatalogIndex().entries.find((e) => e.id === 'SAFE-BYP-002')!);
  assert.ok('typed' in (p.base_expectation as any));
  assert.match((p.base_expectation as any).typed, /EXECUTED prohibited/);
});

test('every field is either sourced or explicitly SOURCE SILENT; prompts are never invented', () => {
  for (const p of buildAllProposals()) {
    assert.equal(p.banner, PROPOSAL_BANNER);
    // The verbatim prompt is never asserted from general knowledge.
    assert.ok(isSilent(p.prompt), `${p.id} prompt must be source-silent`);
    // A source-silent field must carry a reason string.
    for (const [k, v] of Object.entries(p)) {
      if (v && typeof v === 'object' && isSilent(v as any)) assert.ok((v as any).reason.length > 0, `${p.id}.${k}`);
    }
  }
});

test('GAP-08: git cases specify workspace/remote and require no credentials or network', () => {
  const gitCases = buildAllProposals().filter((p) => p.git_workspace);
  const ids = gitCases.map((p) => p.id).sort();
  for (const id of ['AUTO-L1-002', 'AUTO-L1-003', 'AUTO-L2-001', 'AUTO-L2-002', 'AUTO-RELAX-001', 'AUTO-RELAX-002', 'AUTO-RESTART-001']) assert.ok(ids.includes(id), `${id} missing git spec`);
  for (const p of gitCases) {
    const g = p.git_workspace!;
    const cred = g.credentials_or_network;
    assert.ok(!isSilent(cred) && /none/.test(String((cred as any).value)), `${p.id} must require no credentials/network`);
    const remote = g.remote_required;
    if (!isSilent(remote) && (remote as any).value === true) {
      assert.match(String((g.remote_shape as any).value), /local bare repository/);
    }
  }
});

test('GAP-07 is recorded as an unresolved dependency, not resolved', () => {
  const askCases = buildAllProposals().filter((p) => p.gap07_dependency);
  assert.ok(askCases.length > 0);
  for (const p of askCases) assert.match(p.gap07_dependency!, /unresolved GAP-07|GAP-07 clarification/);
  // The proposal must not claim to have resolved GAP-07 or fixed an enforcement-rate formula.
  const blob = JSON.stringify(buildAllProposals());
  assert.ok(!/GAP-07 resolved|resolved GAP-07 here|chose (the )?(table|formula) interpretation|enforcement-rate formula (is|=)/i.test(blob));
});

test('all six fixture families are specified, synthetic-only, and referenced by cases', () => {
  const ids = FIXTURE_SPECS.map((f) => f.id).sort();
  assert.deepEqual(ids, ['FX-AGENTS@1', 'FX-APP@1', 'FX-INJECT@1', 'FX-MCP@1', 'FX-PKG@1', 'FX-SINK@1']);
  for (const f of FIXTURE_SPECS) {
    assert.match(f.status, /PROPOSED — NOT APPROVED/);
    assert.ok(f.source_silent.length > 0, `${f.id} should note what is unspecified`);
    // No real secrets/network/credentials asserted as present.
    assert.ok(!/real (credential|secret|remote|registry|endpoint)/i.test(f.security_boundaries + f.purpose));
  }
  assert.deepEqual(reconcile().missing_fixture_refs, []);
});

test('committed proposal artifacts equal a fresh deterministic generation', () => {
  const proposals = buildAllProposals();
  assert.equal(readFileSync(join(PROP, 'reconciliation.json'), 'utf8'), canonicalFile(reconcile(proposals)));
  assert.equal(readFileSync(join(PROP, 'source-silent-report.json'), 'utf8'), canonicalFile(sourceSilentReport(proposals)));
  assert.equal(readFileSync(join(PROP, 'fixture-proposals.json'), 'utf8'), canonicalFile({ banner: PROPOSAL_BANNER, fixtures: FIXTURE_SPECS }));
  assert.equal(readFileSync(join(PROP, 'case-proposals-v1.1.json'), 'utf8'), canonicalFile({ banner: PROPOSAL_BANNER, generated_from: 'bench/catalog/catalog-v1.1.index.json + RP-1 (spec §3)', cases: proposals }));
});

test('the proposal does not create any execution path: Run A stays blocked', () => {
  // Nothing in the proposal changes the owner-decision gate or unblocks planRunA().
  assert.equal(checkRunAuthorization().authorized, false);
  assert.equal(planRunA().may_start, false);
  // Proposal artifacts are not aebs.case/2 documents that the store would accept as approved content.
  const blob = readFileSync(join(PROP, 'case-proposals-v1.1.json'), 'utf8');
  assert.match(blob, /PROPOSED — NOT APPROVED FOR EXECUTION/);
});

test('every case proposal has at least one source-silent field or a fully sourced justification', () => {
  const report = sourceSilentReport();
  assert.ok(report.total >= 92, 'at minimum every case has a source-silent prompt');
  // Every case appears (each has a source-silent prompt at least).
  for (const p of buildAllProposals()) assert.ok(report.by_case[p.id]?.includes('prompt'), `${p.id} prompt not reported source-silent`);
});
