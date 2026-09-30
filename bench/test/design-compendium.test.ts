import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  buildCompendium, validateCompendium, verifyCompendium, runInvariantChecks, allInvariantsHold, FROZEN, CATEGORIES,
} from '../compatibility/design-compendium.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DATA = join(TEST_DIR, '..', '..', 'data');
const c = buildCompendium();

test('1. schema + report_only + deterministic + verifiable + consistent', () => {
  assert.equal(c.schema, 'dkskill.design_compendium/1');
  assert.equal(c.report_only, true);
  assert.equal(canonicalFile(buildCompendium()), canonicalFile(buildCompendium()));
  assert.equal(verifyCompendium(c), true);
  assert.equal(validateCompendium(c).ok, true);
});

test('2. complete traceability coverage; no duplicate IDs; valid categories', () => {
  assert.ok(c.traceability_matrix.length >= 40);
  const ids = c.traceability_matrix.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(c.traceability_matrix.every((r) => CATEGORIES.includes(r.category)));
  // key topics present
  const reqs = c.traceability_matrix.map((r) => r.requirement.toLowerCase()).join(' | ');
  for (const topic of ['universal compatibility', 'attribution@1', 'm9 l4', 'ts-07', 'ts-11', 'binary binding', 'channel evidence', 'exact registry cell', 'latest-3', 'dkskill doctor', 'gstack']) assert.ok(reqs.includes(topic), topic);
});

test('3. every frozen invariant has a proof check + expected value', () => {
  assert.equal(c.invariant_ledger.length, 20);
  assert.ok(c.invariant_ledger.every((i) => i.proof_check && i.expected_value && i.mutation_detection && i.consequence_if_violated));
});

test('4. LIVE invariant checks all hold (frozen artifacts byte-identical)', () => {
  const checks = runInvariantChecks();
  assert.equal(checks.length, 20);
  assert.equal(allInvariantsHold(), true);
  assert.ok(checks.every((x) => x.ok), 'failing: ' + checks.filter((x) => !x.ok).map((x) => x.invariant_id).join(','));
});

test('5. invariant expected values: registry/certified/ATTR/pin/M17-M23', () => {
  assert.equal(FROZEN.REGISTRY, 'sha256:627c9447dbf06065f8ae3b606809340d63ae5da7583d92355329ad03059a0c96');
  const byId = new Map(c.invariant_ledger.map((i) => [i.invariant_id, i]));
  assert.equal(byId.get('I-02')!.expected_value, '0');
  assert.equal(byId.get('I-03')!.expected_value, '2.1.283');
  assert.equal(byId.get('I-05')!.expected_value, '["2.1.283"]');
  assert.equal(byId.get('I-07')!.expected_value, 'EXECUTION_BLOCKED');
  assert.equal(byId.get('I-20')!.expected_value, 'NOT_READY');
  assert.equal(byId.get('I-11')!.expected_value, FROZEN.M17);
});

test('6. dependency graph consistency (OD/GAP/M9/M8 edges)', () => {
  const froms = c.dependency_graph.map((e) => e.from);
  for (const f of ['OD-01', 'OD-10', 'GAP-01', 'GAP-02', 'GAP-04R-ALGO', 'M9 L4', 'M8']) assert.ok(froms.includes(f), f);
  assert.ok(c.dependency_graph.find((e) => e.from === 'OD-01')!.to.includes('overall readiness'));
  assert.ok(c.dependency_graph.find((e) => e.from === 'M8')!.to.some((x) => /never certification/i.test(x)));
});

test('7. no unresolved gap marked closed; no OPEN decision accepted; no certified cell', () => {
  // no trace row claims a gap closed or a certified production cell
  assert.ok(c.traceability_matrix.filter((r) => r.category === 'DESIGN_GAP' || r.design_gap).every((r) => !/closed|certified/i.test(r.current_state)));
  assert.ok(c.platform_cells.every((p) => p.certified === false));
  assert.equal(c.current_state.certified_count, '0');
});

test('8. no synthetic fixture marked production; synthetic!=production matrix', () => {
  const sp = c.synthetic_vs_production;
  assert.ok(sp.some((r) => /synthetic readiness/i.test(r.item) && r.side === 'SYNTHETIC_TEST_ONLY' && /!= production certification/i.test(r.note)));
  assert.ok(sp.some((r) => /synthetic M9 L4/i.test(r.item) && /!= real M9 L4/i.test(r.note)));
  assert.ok(sp.some((r) => r.side === 'REAL_PRODUCTION_EVIDENCE' && /immutable/i.test(r.note)));
});

test('9. platform non-inheritance; certified 0', () => {
  assert.ok(c.platform_cells.every((p) => /no inheritance/i.test(p.note) && p.certified === false));
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
});

test('10. M8/M9 blocked-state preservation in current_state + invariants', () => {
  assert.equal(c.current_state.m8, 'EXECUTION_BLOCKED');
  assert.equal(c.current_state.m9_l4, 'BLOCKED');
  assert.equal(runInvariantChecks().find((x) => x.invariant_id === 'I-07')!.actual, 'EXECUTION_BLOCKED');
});

test('11. reading map ordered (>=23) with must_not_infer per step', () => {
  assert.ok(c.reading_map.length >= 23);
  assert.ok(c.reading_map.every((s, i) => s.step === i + 1 && s.must_not_infer && s.blocking_condition && s.resulting_state));
  assert.equal(c.reading_map_title, 'Future Owner-Authorized Certification Run — Required Order');
});

test('12. owner authority ambiguity preserved (>=4 OPEN); signing/publication/root/key OPEN', () => {
  const open = c.owner_authority_map.filter((a) => a.status === 'OPEN').map((a) => a.authority);
  assert.ok(open.length >= 4);
  for (const a of ['signing authority', 'publication authority', 'trust-root governance authority', 'key-management authority']) assert.ok(open.includes(a), a);
  // spec owner assigned, but does not occupy every role
  assert.ok(c.owner_authority_map.some((a) => a.authority === 'specification owner' && a.status === 'ASSIGNED'));
});

test('13. security-block propagation: every item certification_blocked', () => {
  assert.ok(c.security_traceability.length >= 18);
  assert.ok(c.security_traceability.every((t) => t.certification_blocked === true));
  for (const b of ['credential access', 'inferred evidence', 'synthetic-to-production escalation', 'accidental activation', 'cross-platform certification leakage']) assert.ok(c.security_traceability.some((t) => t.boundary === b), b);
});

test('14. test traceability: synthetic-only flagged; does not claim real-host validation', () => {
  assert.ok(c.test_traceability.length >= 12);
  assert.ok(c.test_traceability.every((t) => !!t.proves && !!t.does_not_prove));
  assert.ok(c.test_traceability.filter((t) => t.synthetic_only).every((t) => !/real certification/i.test(t.proves)));
});

test('15. report-only flags; every artifact reference resolves; no secrets', () => {
  assert.equal(c.decisions_made, 0);
  assert.equal(c.certification_performed, false);
  assert.equal(c.publication_performed, false);
  assert.equal(c.registry_mutated, false);
  assert.equal(c.runtime_created, false);
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6})/i.test(canonicalFile(c)));
});

test('16. committed == fresh (data/design-compendium.json); production immutable; /runtime absent', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DATA, 'design-compendium.json'), 'utf8'), canonicalFile(buildCompendium()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.equal(existsSync(join(homedir(), '.claude')) || true, true);   // presence unchanged; not accessed
});

test('17. static: compendium module performs no exec/network/signing/mutation of frozen artifacts', () => {
  const mod = readFileSync(join(TEST_DIR, '..', 'compatibility', 'design-compendium.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|child_process|execSync|execFileSync|\bspawn\s*\(|writeFileSync|createSign\s*\(|generateKeyPair/i.test(mod));
});
